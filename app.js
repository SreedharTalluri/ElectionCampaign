const MAX_FILE_SIZE = 5 * 1024 * 1024;
const STORAGE_KEYS = {
  candidate: "election-campaign-candidate-photo",
  party: "election-campaign-party-logo",
};

const candidateInput = document.querySelector("#candidate-upload");
const partyInput = document.querySelector("#party-upload");
const candidatePhoto = document.querySelector("#candidate-photo");
const candidatePlaceholder = document.querySelector("#candidate-photo-placeholder");
const photoPreviewImage = document.querySelector("#photo-preview-image");
const photoPreviewPlaceholder = document.querySelector(".preview-initials");
const logoPreviewImage = document.querySelector("#logo-preview-image");
const logoFallback = document.querySelector(".logo-fallback");
const statusMessage = document.querySelector("#upload-status");
const partyMark = document.querySelector("#header-party-mark");

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function showCandidatePhoto(dataUrl) {
  candidatePhoto.src = dataUrl;
  candidatePhoto.classList.remove("hidden");
  candidatePlaceholder.classList.add("hidden");
  photoPreviewImage.src = dataUrl;
  photoPreviewImage.classList.remove("hidden");
  photoPreviewPlaceholder.classList.add("hidden");
}

function showPartyLogo(dataUrl) {
  logoPreviewImage.src = dataUrl;
  logoPreviewImage.classList.remove("hidden");
  logoFallback.classList.add("hidden");
  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = "";
  partyMark.replaceChildren(image);
}

function loadSavedImages() {
  try {
    const candidate = localStorage.getItem(STORAGE_KEYS.candidate);
    const party = localStorage.getItem(STORAGE_KEYS.party);
    if (candidate) showCandidatePhoto(candidate);
    if (party) showPartyLogo(party);
  } catch {
    showStatus("Browser storage is unavailable. Images will only last for this visit.", true);
  }
}

function handleUpload(input, storageKey, updatePreview, acceptedTypes) {
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!acceptedTypes.includes(file.type)) {
      showStatus("Choose a supported image file.", true);
      input.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showStatus("That image is larger than 5 MB. Choose a smaller file.", true);
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        showStatus("The image could not be read. Please try another file.", true);
        return;
      }

      try {
        localStorage.setItem(storageKey, reader.result);
        updatePreview(reader.result);
        showStatus("Image saved in this browser.");
      } catch {
        updatePreview(reader.result);
        showStatus("Image updated for this visit, but browser storage is full or unavailable.", true);
      }
    });
    reader.addEventListener("error", () => showStatus("The image could not be read. Please try another file.", true));
    reader.readAsDataURL(file);
  });
}

handleUpload(candidateInput, STORAGE_KEYS.candidate, showCandidatePhoto, ["image/jpeg", "image/png", "image/webp", "image/gif"]);
handleUpload(partyInput, STORAGE_KEYS.party, showPartyLogo, ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
