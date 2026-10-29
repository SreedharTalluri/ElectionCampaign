const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createHash, timingSafeEqual } = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { Pool } = require("pg");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const bodyLimit = 16 * 1024;
const categories = new Set([
  "Infrastructure",
  "Housing",
  "Public safety",
  "Environment",
  "Healthcare",
  "Education",
  "Transport",
  "Other",
]);
const statuses = new Set(["Open", "In progress", "Resolved"]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set before starting the server.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > bodyLimit) {
        settled = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });

    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function validateProblem(body, { allowLegacy = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A JSON object is required.");
  }

  const { title, category, division, location, description } = body;
  const mobileNumber = body.mobileNumber === undefined ? "" : body.mobileNumber;
  const emailAddress = body.emailAddress === undefined ? "" : body.emailAddress;
  const assignedMla = body.assignedMla === undefined ? "" : body.assignedMla;
  if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 100) {
    throw new HttpError(400, "Problem title must be between 1 and 100 characters.");
  }
  if (typeof category !== "string" || !categories.has(category)) {
    throw new HttpError(400, "Choose a valid problem category.");
  }
  if (typeof division !== "string" || division.trim().length > 100 || (!allowLegacy && division.trim().length === 0)) {
    throw new HttpError(400, "Enter a division of 1 to 100 characters.");
  }
  if (typeof location !== "string" || location.length > 100) {
    throw new HttpError(400, "Location must be 100 characters or fewer.");
  }
  if (typeof description !== "string" || description.trim().length === 0 || description.trim().length > 1000) {
    throw new HttpError(400, "Problem details must be between 1 and 1000 characters.");
  }
  if (typeof mobileNumber !== "string" || mobileNumber.length > 32 || (mobileNumber && !/^[+()\d.\-\s]+$/.test(mobileNumber))) {
    throw new HttpError(400, "Enter a valid mobile number of up to 32 characters.");
  }
  if (typeof emailAddress !== "string" || emailAddress.length > 254
      || (emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress))) {
    throw new HttpError(400, "Enter a valid email address of up to 254 characters.");
  }
  if (typeof assignedMla !== "string" || assignedMla.trim().length > 120) {
    throw new HttpError(400, "Assigned MLA name must be 120 characters or fewer.");
  }

  const problem = {
    title: title.trim(),
    category,
    division: division.trim(),
    location: location.trim(),
    description: description.trim(),
    mobileNumber: mobileNumber.trim(),
    emailAddress: emailAddress.trim(),
    assignedMla: assignedMla.trim(),
    status: body.status === undefined ? "Open" : body.status,
    createdAt: body.createdAt === undefined ? new Date().toISOString() : body.createdAt,
    legacyId: body.legacyId,
  };

  if (!statuses.has(problem.status)) {
    if (allowLegacy) problem.status = "Open";
    else throw new HttpError(400, "Choose a valid problem status.");
  }
  if (typeof problem.createdAt !== "string" || Number.isNaN(Date.parse(problem.createdAt))) {
    if (allowLegacy) problem.createdAt = new Date().toISOString();
    else throw new HttpError(400, "Problem creation date is invalid.");
  }
  if (problem.legacyId !== undefined
      && (typeof problem.legacyId !== "string" || problem.legacyId.length === 0 || problem.legacyId.length > 100)) {
    throw new HttpError(400, "Legacy problem ID is invalid.");
  }

  return problem;
}

function hasValidAdminToken(token) {
  if (typeof token !== "string" || !process.env.ADMIN_TOKEN) return false;
  const providedHash = createHash("sha256").update(token).digest();
  const configuredHash = createHash("sha256").update(process.env.ADMIN_TOKEN).digest();
  return timingSafeEqual(providedHash, configuredHash);
}

function requireAdmin(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!hasValidAdminToken(token)) throw new HttpError(401, "Admin authorization is required.");
}

function mapProblem(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    division: row.division,
    location: row.location,
    description: row.description,
    mobileNumber: row.mobile_number,
    emailAddress: row.email_address,
    assignedMla: row.assigned_mla,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/admin/verify" && request.method === "POST") {
    if (!process.env.ADMIN_TOKEN) {
      throw new HttpError(
        503,
        "Admin access is not configured. In Render, set the ADMIN_TOKEN environment variable for the web service, then save and redeploy.",
      );
    }
    const body = await readJsonBody(request);
    if (!body || !hasValidAdminToken(body.token)) {
      throw new HttpError(401, "Admin password is incorrect.");
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/problems" && request.method === "GET") {
    const result = await pool.query(
      `SELECT id, title, category, division, location, description, mobile_number, email_address,
              assigned_mla, status, created_at
       FROM local_problems
       ORDER BY created_at DESC, id DESC`,
    );
    sendJson(response, 200, result.rows.map(mapProblem));
    return;
  }

  if (pathname === "/api/problems" && request.method === "POST") {
    const body = await readJsonBody(request);
    const isLegacyMigration = Boolean(body && body.legacyId);
    const problem = validateProblem(body, { allowLegacy: isLegacyMigration });
    problem.status = "Open";
    problem.assignedMla = "";
    if (!isLegacyMigration) problem.createdAt = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO local_problems
         (legacy_id, title, category, division, location, description, mobile_number, email_address,
          assigned_mla, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (legacy_id) DO UPDATE SET legacy_id = EXCLUDED.legacy_id
       RETURNING id, title, category, division, location, description, mobile_number, email_address,
                 assigned_mla, status, created_at`,
      [
        problem.legacyId || null,
        problem.title,
        problem.category,
        problem.division,
        problem.location,
        problem.description,
        problem.mobileNumber,
        problem.emailAddress,
        problem.assignedMla,
        problem.status,
        problem.createdAt,
      ],
    );
    sendJson(response, 201, mapProblem(result.rows[0]));
    return;
  }

  const problemRoute = pathname.match(/^\/api\/problems\/([0-9a-f-]+)$/i);
  if (problemRoute && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(problemRoute[1])) {
    throw new HttpError(400, "Problem ID is invalid.");
  }

  if (problemRoute && request.method === "PATCH") {
    requireAdmin(request);
    const body = await readJsonBody(request);
    if (body && typeof body === "object" && !Array.isArray(body)
        && Object.keys(body).length === 1 && Object.hasOwn(body, "status")) {
      if (!statuses.has(body.status)) throw new HttpError(400, "Choose a valid problem status.");
      const result = await pool.query(
        `UPDATE local_problems SET status = $1 WHERE id = $2
         RETURNING id, title, category, division, location, description, mobile_number, email_address,
                   assigned_mla, status, created_at`,
        [body.status, problemRoute[1]],
      );
      if (result.rowCount === 0) throw new HttpError(404, "Problem not found.");
      sendJson(response, 200, mapProblem(result.rows[0]));
      return;
    }

    const problem = validateProblem(body);
    const result = await pool.query(
      `UPDATE local_problems
       SET title = $1, category = $2, division = $3, location = $4, description = $5,
           mobile_number = $6, email_address = $7, assigned_mla = $8, status = $9
       WHERE id = $10
       RETURNING id, title, category, division, location, description, mobile_number, email_address,
                 assigned_mla, status, created_at`,
      [
        problem.title,
        problem.category,
        problem.division,
        problem.location,
        problem.description,
        problem.mobileNumber,
        problem.emailAddress,
        problem.assignedMla,
        problem.status,
        problemRoute[1],
      ],
    );
    if (result.rowCount === 0) throw new HttpError(404, "Problem not found.");
    sendJson(response, 200, mapProblem(result.rows[0]));
    return;
  }

  if (problemRoute && request.method === "DELETE") {
    requireAdmin(request);
    const result = await pool.query("DELETE FROM local_problems WHERE id = $1 RETURNING id", [problemRoute[1]]);
    if (result.rowCount === 0) throw new HttpError(404, "Problem not found.");
    sendJson(response, 200, { id: result.rows[0].id });
    return;
  }

  if (pathname === "/api/problems" || problemRoute) {
    response.writeHead(405, { Allow: problemRoute ? "GET, PATCH, DELETE" : "GET, POST" });
    response.end();
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);
  const relativePath = path.relative(root, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      console.error(`Unable to serve ${filePath}:`, error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Internal server error");
    });
    stream.pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (pathname === "/health" && request.method === "GET") {
    try {
      await pool.query("SELECT 1");
      sendJson(response, 200, { status: "ok" });
    } catch (error) {
      console.error("Database health check failed:", error);
      sendJson(response, 503, { status: "unavailable" });
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    try {
      await handleApi(request, response, pathname);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, { error: error.message });
      } else {
        console.error("Database API request failed:", error);
        sendJson(response, 500, { error: "Unable to complete the database request." });
      }
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  serveStatic(request, response, decodedPath);
});

async function startServer() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_problems (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      legacy_id TEXT UNIQUE,
      title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
      category TEXT NOT NULL,
      division TEXT NOT NULL DEFAULT '' CHECK (char_length(division) <= 100),
      location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 100),
      description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
      mobile_number TEXT NOT NULL DEFAULT '',
      email_address TEXT NOT NULL DEFAULT '',
      assigned_mla TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In progress', 'Resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE local_problems
      ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS email_address TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS assigned_mla TEXT NOT NULL DEFAULT ''
  `);

  server.listen(port, "0.0.0.0", () => {
    console.log(`Election campaign site running on port ${port}`);
  });
}

startServer().catch(async (error) => {
  console.error("Unable to initialize the PostgreSQL database:", error);
  await pool.end();
  process.exit(1);
});

server.on("error", (error) => {
  console.error("Unable to start the server:", error.message);
  pool.end().finally(() => process.exit(1));
});
