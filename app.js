const candidatePhoto = document.querySelector(".candidate-photo");
const candidatePlaceholder = document.querySelector("#candidate-photo-placeholder");
const partyLogo = document.querySelector(".party-mark img");
const partyMarkFallback = document.querySelector(".party-mark-fallback");
const candidateImages = ["images/candidate-photo.jpg", "images/candidate-photo-2.jpg"];

function showImageWhenLoaded(image, onLoad) {
  const revealImage = () => {
    image.classList.remove("hidden");
    onLoad();
  };

  image.addEventListener("load", revealImage, { once: true });
  if (image.complete && image.naturalWidth > 0) revealImage();
}

showImageWhenLoaded(candidatePhoto, () => {
  candidatePlaceholder.classList.add("hidden");

  const secondCandidatePhoto = new Image();
  secondCandidatePhoto.src = candidateImages[1];
  secondCandidatePhoto.addEventListener("load", () => {
    let activeImageIndex = 0;
    window.setInterval(() => {
      activeImageIndex = (activeImageIndex + 1) % candidateImages.length;
      candidatePhoto.src = candidateImages[activeImageIndex];
    }, 1000);
  }, { once: true });
});
showImageWhenLoaded(partyLogo, () => partyMarkFallback.classList.add("hidden"));
