const content = [
  ["no-sql-required", "Make decisions with data — no SQL required"],
  ["bring-data-to-slack", "Bring your charts and data into Slack"],
  ["click-charts-dive-deeper", "Click on your charts to dive deeper"],
  [
    "click-column-headings",
    "Click on column headings in your tables to explore them",
  ],
];

const animation = document.getElementById("animation");
const heading = document.getElementById("heading");

const fadeTimeInMilliseconds = 500;
let counter = 0;

function switcher() {
  setInterval(function() {
    counter++;
    switchHeading(counter);
    switchAnimation(counter);
  }, 7000);
}

function switchHeading(counter) {
  heading.className = "transparent";

  // Wait for fade out of current heading
  setTimeout(function() {
    updateHeading(counter);
  }, fadeTimeInMilliseconds);
}

function switchAnimation(counter) {
  animation.className = "animation transparent";
  heading.className = "heading transparent";

  // Wait for fade out of current animation
  setTimeout(function() {
    fadeInNewAnimation(counter);
  }, fadeTimeInMilliseconds);
}

function fadeInNewAnimation(counter) {
  const srcPrefix = content[counter % content.length][0];

  animation.className = "animation";
  animation.src = `app/instance-loading-page/img/${srcPrefix}.png`;
}

function updateHeading(counter) {
  heading.className = "heading";
  heading.innerHTML = content[counter % content.length][1];
}

function poll() {
  const req = new XMLHttpRequest();
  req.open("GET", "api/health", true);
  req.onreadystatechange = function() {
    if (req.readyState === 4) {
      if (req.status === 200) {
        window.location.reload();
      } else {
        setTimeout(poll, 500);
      }
    }
  };
  req.send();
}

switcher();
poll();
