const STORAGE_KEY = "election-campaign-local-problems";
const form = document.querySelector("#problem-form");
const problemList = document.querySelector("#problem-list");
const problemCount = document.querySelector("#problem-count");
const statusMessage = document.querySelector("#problem-status");
const partyLogo = document.querySelector(".party-mark img");
const partyMarkFallback = document.querySelector(".party-mark-fallback");
let problems = [];

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

function readProblems() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved issue data is not a list.");

    return parsed.filter((problem) =>
      problem
      && typeof problem.id === "string"
      && typeof problem.title === "string"
      && typeof problem.category === "string"
      && typeof problem.location === "string"
      && typeof problem.description === "string"
      && typeof problem.createdAt === "string"
    );
  } catch (error) {
    showStatus("Saved issues could not be read from this browser.", true);
    console.error("Unable to read saved local problems:", error);
    return [];
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderProblems() {
  problemList.replaceChildren();
  problemCount.textContent = `${problems.length} ${problems.length === 1 ? "issue" : "issues"}`;

  if (problems.length === 0) {
    problemList.append(makeElement("p", "problem-empty", "No issues saved yet. Add a local concern using the form."));
    return;
  }

  [...problems]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .forEach((problem) => {
      const entry = makeElement("article", "problem-entry");
      const top = makeElement("div", "problem-entry-top");
      const heading = document.createElement("div");
      heading.append(makeElement("h3", "", problem.title));

      const meta = makeElement("div", "problem-entry-meta");
      meta.append(makeElement("span", "problem-category", problem.category));
      if (problem.location) meta.append(makeElement("span", "", problem.location));

      const date = new Date(problem.createdAt);
      meta.append(makeElement("time", "", Number.isNaN(date.getTime()) ? "" : date.toLocaleString()));
      heading.append(meta);

      const removeButton = makeElement("button", "problem-delete", "Remove");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remove issue: ${problem.title}`);
      removeButton.addEventListener("click", () => removeProblem(problem.id));

      top.append(heading, removeButton);
      entry.append(top, makeElement("p", "problem-description", problem.description));
      problemList.append(entry);
    });
}

function saveProblems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(problems));
    return true;
  } catch (error) {
    showStatus("Could not save issues. Browser storage may be full or unavailable.", true);
    console.error("Unable to save local problems:", error);
    return false;
  }
}

function removeProblem(id) {
  const previous = problems;
  problems = problems.filter((problem) => problem.id !== id);
  if (!saveProblems()) {
    problems = previous;
    return;
  }
  renderProblems();
  showStatus("Issue removed.");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const issue = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: formData.get("title").trim(),
    category: formData.get("category"),
    location: formData.get("location").trim(),
    description: formData.get("description").trim(),
    createdAt: new Date().toISOString(),
  };

  if (!issue.title || !issue.description) {
    showStatus("Enter a title and description for the issue.", true);
    return;
  }

  problems.unshift(issue);
  if (!saveProblems()) {
    problems.shift();
    return;
  }

  form.reset();
  renderProblems();
  showStatus("Issue saved in this browser.");
  document.querySelector("#problem-title").focus();
});

problems = readProblems();
renderProblems();
