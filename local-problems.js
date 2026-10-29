const STORAGE_KEY = "election-campaign-local-problems";
const form = document.querySelector("#problem-form");
const problemList = document.querySelector("#problem-list");
const problemCount = document.querySelector("#problem-count");
const statusMessage = document.querySelector("#problem-status");
const adminSignIn = document.querySelector("#admin-sign-in");
const adminStatusMessage = document.querySelector("#admin-status");
const divisionFilter = document.querySelector("#division-filter");
const statusFilter = document.querySelector("#status-filter");
const partyLogo = document.querySelector(".party-mark img");
const partyMarkFallback = document.querySelector(".party-mark-fallback");
const PROBLEM_STATUSES = ["Open", "In progress", "Resolved"];
const PROBLEM_CATEGORIES = [
  "Infrastructure",
  "Housing",
  "Public safety",
  "Environment",
  "Healthcare",
  "Education",
  "Transport",
  "Other",
];
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

function formatPhoneNumber(value) {
  const hasPlusPrefix = value.trimStart().startsWith("+");
  const digits = value.replace(/\D/g, "").slice(0, 15);
  const groups = digits.match(/.{1,3}/g) || [];
  return `${hasPlusPrefix ? "+" : ""}${groups.join(" ")}`;
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

function addContactLink(container, label, value, href) {
  if (!value) return;
  const item = makeElement("p", "problem-contact");
  item.append(makeElement("strong", "", `${label}: `));
  if (value.includes("***")) {
    item.append(document.createTextNode(value));
    container.append(item);
    return;
  }
  const link = makeElement("a", "", value);
  link.href = href;
  item.append(link);
  container.append(item);
}

function addEditField(form, labelText, name, value, type = "text", required = false, maxLength = 100) {
  const label = makeElement("label", "problem-edit-field", labelText);
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.name = name;
  input.value = value || "";
  input.maxLength = maxLength;
  input.required = required;
  if (name === "description") input.rows = 3;
  label.append(input);
  form.append(label);
}

function createEditForm(problem, details) {
  const form = makeElement("form", "problem-edit-form");
  form.noValidate = false;
  addEditField(form, "Problem", "title", problem.title, "text", true, 100);

  const categoryLabel = makeElement("label", "problem-edit-field", "Category");
  const categorySelect = document.createElement("select");
  categorySelect.name = "category";
  categorySelect.required = true;
  PROBLEM_CATEGORIES.forEach((category) => {
    const option = makeElement("option", "", category);
    option.value = category;
    categorySelect.append(option);
  });
  categorySelect.value = problem.category;
  categoryLabel.append(categorySelect);
  form.append(categoryLabel);

  addEditField(form, "Division", "division", problem.division, "text", true, 100);
  addEditField(form, "Neighborhood or street", "location", problem.location, "text", false, 100);
  addEditField(form, "Mobile number", "mobileNumber", problem.mobileNumber, "tel", false, 32);
  addEditField(form, "Email", "emailAddress", problem.emailAddress, "email", false, 254);
  addEditField(form, "Assigned MLA", "assignedMla", problem.assignedMla, "text", false, 120);
  addEditField(form, "Details", "description", problem.description, "textarea", true, 1000);

  const statusLabel = makeElement("label", "problem-edit-field", "Status");
  const statusSelect = document.createElement("select");
  statusSelect.name = "status";
  PROBLEM_STATUSES.forEach((status) => {
    const option = makeElement("option", "", status);
    option.value = status;
    statusSelect.append(option);
  });
  statusSelect.value = problem.status;
  statusLabel.append(statusSelect);
  form.append(statusLabel);

  const actions = makeElement("div", "problem-edit-actions");
  const saveButton = makeElement("button", "admin-login-button", "Save changes");
  saveButton.type = "submit";
  const cancelButton = makeElement("button", "problem-delete", "Cancel");
  cancelButton.type = "button";
  cancelButton.addEventListener("click", () => {
    details.open = false;
  });
  actions.append(saveButton, cancelButton);
  form.append(actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProblemEdits(problem.id, new FormData(form), saveButton);
  });
  return form;
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

  const tableWrapper = makeElement("div", "problem-table-wrap");
  const table = makeElement("table", "problem-table");
  const caption = makeElement("caption", "visually-hidden", "Local problems with contact details, assignment, and status");
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Problem", "Division", "Category", "Contact", "Status", "Assigned MLA", "Actions"].forEach((label) => {
    headerRow.append(makeElement("th", "", label));
  });
  header.append(headerRow);
  const body = document.createElement("tbody");

  [...visibleProblems]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .forEach((problem) => {
      const row = document.createElement("tr");
      const titleCell = document.createElement("th");
      titleCell.scope = "row";
      titleCell.append(makeElement("span", "problem-table-title", problem.title));
      titleCell.append(makeElement("span", "problem-table-description", problem.description));
      const divisionCell = makeElement("td", "", problem.division || "Division not specified");
      if (problem.location) divisionCell.append(makeElement("span", "problem-table-location", problem.location));
      const categoryCell = makeElement("td", "problem-category", problem.category);

      const contactCell = document.createElement("td");
      const contacts = makeElement("div", "problem-contacts");
      addContactLink(contacts, "Mobile", problem.mobileNumber, `tel:${problem.mobileNumber.replace(/[^\d+]/g, "")}`);
      addContactLink(contacts, "Email", problem.emailAddress, `mailto:${problem.emailAddress}`);
      if (!problem.mobileNumber && !problem.emailAddress) contacts.textContent = "Not provided";
      contactCell.append(contacts);

      const statusCell = document.createElement("td");
      statusCell.append(makeElement("span", "problem-status-badge", problem.status));
      const assignmentCell = document.createElement("td");
      assignmentCell.textContent = problem.assignedMla || "Not assigned";

      const actionsCell = document.createElement("td");
      const actions = makeElement("div", "problem-actions");
      const details = makeElement("details", "problem-edit");
      details.open = false;
      const summary = makeElement("summary", "", "Edit");
      summary.setAttribute("aria-disabled", String(!adminToken));
      if (!adminToken) summary.classList.add("disabled");
      summary.addEventListener("click", (event) => {
        if (!adminToken) event.preventDefault();
      });
      details.append(summary, createEditForm(problem, details));
      const removeButton = makeElement("button", "problem-delete", "Delete");
      removeButton.type = "button";
      removeButton.disabled = !adminToken;
      removeButton.setAttribute("aria-label", `Delete issue: ${problem.title}`);
      removeButton.addEventListener("click", () => removeProblem(problem.id));
      actions.append(details, removeButton);
      actionsCell.append(actions);

      const date = new Date(problem.createdAt);
      titleCell.append(makeElement("time", "problem-table-date", Number.isNaN(date.getTime()) ? "" : date.toLocaleString()));
      row.append(titleCell, divisionCell, categoryCell, contactCell, statusCell, assignmentCell, actionsCell);
      body.append(row);
    });

  table.append(caption, header, body);
  tableWrapper.append(table);
  problemList.append(tableWrapper);
}

async function loadProblems() {
  problemList.replaceChildren(makeElement("p", "problem-empty", "Loading problems…"));
  try {
    await migrateBrowserProblems();
    problems = await apiRequest("/api/problems", { admin: Boolean(adminToken) });
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
      adminSignIn.textContent = "Admin sign in";
      renderProblems();
      adminStatusMessage.textContent = "Admin access expired. Enter the password again.";
      adminStatusMessage.classList.add("error");
    } else {
      showStatus(error.message, true);
    }
  }
}

async function saveProblemEdits(id, formData, saveButton) {
  const problem = Object.fromEntries(formData.entries());
  saveButton.disabled = true;
  try {
    const updatedProblem = await apiRequest(`/api/problems/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(problem),
      admin: true,
    });
    problems = problems.map((item) => item.id === id ? updatedProblem : item);
    renderProblems();
    showStatus("Problem details and MLA assignment updated.");
  } catch (error) {
    if (error.message.includes("authorization")) {
      adminToken = "";
      adminSignIn.textContent = "Admin sign in";
      renderProblems();
      adminStatusMessage.textContent = "Admin access expired. Enter the password again.";
      adminStatusMessage.classList.add("error");
    } else {
      saveButton.disabled = false;
      showStatus(error.message, true);
    }
  }
}

adminSignIn.addEventListener("click", async () => {
  if (adminToken) {
    adminToken = "";
    adminSignIn.textContent = "Admin sign in";
    adminStatusMessage.textContent = "Admin controls signed out.";
    adminStatusMessage.classList.remove("error");
    renderProblems();
    return;
  }

  const token = window.prompt("Enter the admin password configured in the server environment:");
  if (token === null) return;
  if (!token) {
    adminStatusMessage.textContent = "Enter the admin password to enable admin controls.";
    adminStatusMessage.classList.add("error");
    return;
  }

  adminSignIn.disabled = true;
  try {
    await apiRequest("/api/admin/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    adminToken = token;
    adminStatusMessage.textContent = "Admin controls enabled for this page session.";
    adminStatusMessage.classList.remove("error");
    adminSignIn.textContent = "Sign out";
    await loadProblems();
    adminSignIn.disabled = false;
  } catch (error) {
    adminStatusMessage.textContent = error.message;
    adminStatusMessage.classList.add("error");
    adminSignIn.disabled = false;
  }
});

document.querySelector("#problem-mobile").addEventListener("input", (event) => {
  const input = event.currentTarget;
  const formatted = formatPhoneNumber(input.value);
  if (input.value !== formatted) input.value = formatted;
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
    mobileNumber: formData.get("mobileNumber").trim(),
    emailAddress: formData.get("emailAddress").trim(),
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
      admin: Boolean(adminToken),
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
