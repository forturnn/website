(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll(".gallery-item"));
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var lightboxCaption = document.getElementById("lightbox-caption");
  var closeBtn = document.getElementById("lightbox-close");
  var prevBtn = document.getElementById("lightbox-prev");
  var nextBtn = document.getElementById("lightbox-next");

  if (!items.length || !lightbox) return;

  var currentIndex = -1;

  function open(index) {
    currentIndex = (index + items.length) % items.length;
    var item = items[currentIndex];
    lightboxImg.src = item.getAttribute("data-large");
    lightboxImg.alt = item.getAttribute("data-caption") || "";
    lightboxCaption.textContent = item.getAttribute("data-caption") || "";
    lightbox.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    lightbox.classList.remove("is-open");
    lightboxImg.src = "";
    document.body.style.overflow = "";
    currentIndex = -1;
  }

  items.forEach(function (item, index) {
    item.addEventListener("click", function () {
      open(index);
    });
  });

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", function () { open(currentIndex - 1); });
  nextBtn.addEventListener("click", function () { open(currentIndex + 1); });

  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) close();
  });

  document.addEventListener("keydown", function (e) {
    if (!lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") open(currentIndex - 1);
    if (e.key === "ArrowRight") open(currentIndex + 1);
  });
})();
