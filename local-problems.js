const STORAGE_KEY = "election-campaign-local-problems";
const form = document.querySelector("#problem-form");
const problemList = document.querySelector("#problem-list");
const problemCount = document.querySelector("#problem-count");
const statusMessage = document.querySelector("#problem-status");
const adminLogin = document.querySelector("#admin-login");
const adminPassword = document.querySelector("#admin-password");
const adminStatusMessage = document.querySelector("#admin-status");
const divisionFilter = document.querySelector("#division-filter");
const statusFilter = document.querySelector("#status-filter");
const partyLogo = document.querySelector(".party-mark img");
const partyMarkFallback = document.querySelector(".party-mark-fallback");
const PROBLEM_STATUSES = ["Open", "In progress", "Resolved"];
let problems = [];
let adminToken = "";

function showImageWhenLoaded(image, onLoad) {
  const revealImage = () => {
    image.classList.remove("hidden");
    onLoad();
  };

  image.addEventListener("load", revealImage, { once: true });
  if (image.complete && image.naturalWidth > 0) revealImage();
}

showImageWhenLoaded(partyLogo, () => partyMarkFallback.classList.add("hidden"));

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function apiRequest(url, options = {}) {
  const { admin = false, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (requestOptions.body) headers.set("Content-Type", "application/json");
  if (admin) headers.set("Authorization", `Bearer ${adminToken}`);
  const response = await fetch(url, {
    ...requestOptions,
    headers,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The database request failed.");
  return result;
}

async function migrateBrowserProblems() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to read browser-stored problems for migration:", error);
    showStatus("Could not access older browser-saved problems. Database tracking is still available.", true);
    return;
  }
  if (!stored) return;

  let saved;
  try {
    saved = JSON.parse(stored);
  } catch (error) {
    console.error("Older browser-stored problems are invalid JSON:", error);
    showStatus("Older saved problems could not be migrated. They remain in this browser.", true);
    return;
  }
  if (!Array.isArray(saved)) {
    showStatus("Older saved problems could not be migrated. They remain in this browser.", true);
    return;
  }

  const validProblems = saved.filter((problem) =>
    problem
    && typeof problem.id === "string"
    && typeof problem.title === "string"
    && typeof problem.category === "string"
    && typeof problem.description === "string"
  );
  if (validProblems.length !== saved.length) {
    showStatus("Some older saved problems are invalid and were left in this browser.", true);
    return;
  }

  for (const problem of validProblems) {
    await apiRequest("/api/problems", {
      method: "POST",
      body: JSON.stringify({
        legacyId: problem.id,
        title: problem.title,
        category: problem.category,
        division: typeof problem.division === "string" ? problem.division : "",
        location: typeof problem.location === "string" ? problem.location : "",
        description: problem.description,
        status: PROBLEM_STATUSES.includes(problem.status) ? problem.status : "Open",
        createdAt: typeof problem.createdAt === "string" ? problem.createdAt : new Date().toISOString(),
      }),
    });
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Migrated problems could not be cleared from browser storage:", error);
    showStatus("Problems were migrated, but older browser copies could not be cleared.", true);
  }
}

function updateDivisionFilter() {
  const selectedDivision = divisionFilter.value;
  const divisions = [...new Set(problems.map((problem) => problem.division).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));

  const allDivisions = makeElement("option", "", "All divisions");
  allDivisions.value = "";
  divisionFilter.replaceChildren(allDivisions);
  divisions.forEach((division) => {
    const option = makeElement("option", "", division);
    option.value = division;
    divisionFilter.append(option);
  });
  divisionFilter.value = divisions.includes(selectedDivision) ? selectedDivision : "";
}

function renderProblems() {
  updateDivisionFilter();
  problemList.replaceChildren();
  const visibleProblems = problems.filter((problem) =>
    (!divisionFilter.value || problem.division === divisionFilter.value)
    && (!statusFilter.value || problem.status === statusFilter.value)
  );
  problemCount.textContent = `${visibleProblems.length} / ${problems.length}`;

  if (visibleProblems.length === 0) {
    const message = problems.length === 0
      ? "No issues saved yet. Add a local concern using the form."
      : "No problems match these filters.";
    problemList.append(makeElement("p", "problem-empty", message));
    return;
  }

  [...visibleProblems]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .forEach((problem) => {
      const entry = makeElement("article", "problem-entry");
      const top = makeElement("div", "problem-entry-top");
      const heading = document.createElement("div");
      heading.append(makeElement("h3", "", problem.title));

      const meta = makeElement("div", "problem-entry-meta");
      meta.append(makeElement("span", "problem-category", problem.category));
      meta.append(makeElement("span", "", problem.division || "Division not specified"));
      if (problem.location) meta.append(makeElement("span", "", problem.location));

      const date = new Date(problem.createdAt);
      meta.append(makeElement("time", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleString()));
      heading.append(meta);

      const statusControl = makeElement("label", "problem-status-control");
      statusControl.append(makeElement("span", "", "Status"));
      const statusSelect = document.createElement("select");
      statusSelect.setAttribute("aria-label", `Status for ${problem.title}`);
      PROBLEM_STATUSES.forEach((status) => {
        const option = makeElement("option", "", status);
        option.value = status;
        statusSelect.append(option);
      });
      statusSelect.value = problem.status;
      statusSelect.disabled = !adminToken;
      statusSelect.addEventListener("change", () => updateProblemStatus(problem.id, statusSelect.value));
      statusControl.append(statusSelect);

      const removeButton = makeElement("button", "problem-delete", "Remove");
      removeButton.type = "button";
      removeButton.disabled = !adminToken;
      removeButton.setAttribute("aria-label", `Remove issue: ${problem.title}`);
      removeButton.addEventListener("click", () => removeProblem(problem.id));

      const actions = makeElement("div", "problem-actions");
      actions.append(statusControl, removeButton);
      top.append(heading, actions);
      entry.append(top, makeElement("p", "problem-description", problem.description));
      problemList.append(entry);
    });
}

async function loadProblems() {
  problemList.replaceChildren(makeElement("p", "problem-empty", "Loading problems…"));
  try {
    await migrateBrowserProblems();
    problems = await apiRequest("/api/problems");
    renderProblems();
  } catch (error) {
    console.error("Unable to load problems from the database:", error);
    problemCount.textContent = "—";
    problemList.replaceChildren(makeElement("p", "problem-empty", "Problems could not be loaded. Please try again."));
    showStatus(error.message, true);
  }
}

async function removeProblem(id) {
  try {
    await apiRequest(`/api/problems/${encodeURIComponent(id)}`, { method: "DELETE", admin: true });
    problems = problems.filter((problem) => problem.id !== id);
    renderProblems();
    showStatus("Problem removed from the shared database.");
  } catch (error) {
    if (error.message.includes("authorization")) {
      adminToken = "";
      renderProblems();
      adminStatusMessage.textContent = "Admin access expired. Enter the password again.";
      adminStatusMessage.classList.add("error");
    } else {
      showStatus(error.message, true);
    }
  }
}

async function updateProblemStatus(id, status) {
  if (!PROBLEM_STATUSES.includes(status)) {
    showStatus("Choose a valid problem status.", true);
    renderProblems();
    return;
  }

  try {
    const updatedProblem = await apiRequest(`/api/problems/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      admin: true,
    });
    problems = problems.map((problem) => problem.id === id ? updatedProblem : problem);
    renderProblems();
    showStatus("Problem status updated in the shared database.");
  } catch (error) {
    renderProblems();
    if (error.message.includes("authorization")) {
      adminToken = "";
      renderProblems();
      adminStatusMessage.textContent = "Admin access expired. Enter the password again.";
      adminStatusMessage.classList.add("error");
    } else {
      showStatus(error.message, true);
    }
  }
}

adminLogin.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = adminPassword.value;
  const button = adminLogin.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await apiRequest("/api/admin/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    adminToken = token;
    adminPassword.value = "";
    adminStatusMessage.textContent = "Admin controls enabled for this page session.";
    adminStatusMessage.classList.remove("error");
    renderProblems();
  } catch (error) {
    adminStatusMessage.textContent = error.message;
    adminStatusMessage.classList.add("error");
  } finally {
    button.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const issue = {
    title: formData.get("title").trim(),
    category: formData.get("category"),
    division: formData.get("division").trim(),
    location: formData.get("location").trim(),
    description: formData.get("description").trim(),
  };

  if (!issue.title || !issue.division || !issue.description) {
    showStatus("Enter a problem, division, and description.", true);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const savedProblem = await apiRequest("/api/problems", {
      method: "POST",
      body: JSON.stringify(issue),
    });
    problems.unshift(savedProblem);
    form.reset();
    divisionFilter.value = "";
    statusFilter.value = "";
    renderProblems();
    showStatus("Problem saved to the shared database.");
    document.querySelector("#problem-title").focus();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

divisionFilter.addEventListener("change", renderProblems);
statusFilter.addEventListener("change", renderProblems);
loadProblems();
