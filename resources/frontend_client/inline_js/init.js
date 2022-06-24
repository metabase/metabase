const content = [
  "Make decisions with data — no SQL required",
  "Bring your charts and data into Slack",
  "Click on your charts to dive deeper",
  "Click on column headings in your tables to explore them",
];

const animation = document.getElementById("animation");
const heading = document.getElementById("heading");
const progressElement = document.getElementById("progress");

const fadeTimeInMilliseconds = 1000;
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
  const srcPrefix = (counter % content.length) + 1;

  animation.className = "animation";
  animation.src = `app/instance-loading-page/img/${srcPrefix}.gif`;
}

function updateHeading(counter) {
  heading.className = "heading";
  heading.innerHTML = content[counter % content.length];
}

function poll() {
  const req = new XMLHttpRequest();
  req.open("GET", "api/health", true);
  req.onreadystatechange = function() {
    if (req.readyState === 4) {
      if (req.status === 200) {
        window.location.reload();
      } else {
        try {
          const health = JSON.parse(req.responseText);
          if (typeof health.progress === "number") {
            const newValue = health.progress * 100;
            if (newValue !== progressElement.value) {
              progressElement.value = newValue;
            }

            const minutesRemaining = Math.floor((100 - newValue) / 20);
            const pluralizedMinute =
              minutesRemaining > 1 ? "minutes" : "minute";
            status.innerHTML = minutesRemaining + " " + pluralizedMinute + "…";
          }
        } catch (e) {}
        setTimeout(poll, 500);
      }
    }
  };
  req.send();
}

switcher();
poll();
