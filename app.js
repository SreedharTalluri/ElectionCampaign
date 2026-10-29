const candidatePhoto = document.querySelector(".candidate-photo");
const candidatePlaceholder = document.querySelector("#candidate-photo-placeholder");
const partyLogo = document.querySelector(".party-mark img");
const partyMarkFallback = document.querySelector(".party-mark-fallback");

function showImageWhenLoaded(image, onLoad) {
  const revealImage = () => {
    image.classList.remove("hidden");
    onLoad();
  };

  image.addEventListener("load", revealImage, { once: true });
  if (image.complete && image.naturalWidth > 0) revealImage();
}

showImageWhenLoaded(candidatePhoto, () => candidatePlaceholder.classList.add("hidden"));
showImageWhenLoaded(partyLogo, () => partyMarkFallback.classList.add("hidden"));
