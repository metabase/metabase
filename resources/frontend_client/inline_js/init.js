const content = [
  "Make decisions with data — no SQL required",
  "Bring your charts and data into Slack",
  "Click on your charts to dive deeper",
  "Click on column headings in your tables to explore them",
];

const animation = document.getElementById("animation");
const heading = document.getElementById("heading");
const progressElement = document.getElementById("progress");

let counter = 0;

function switcher() {
  setInterval(function() {
    counter++;
    switchAnimation(counter);
  }, 10000);
}

function switchAnimation(counter) {
  animation.className = "transparent";
  heading.className = "transparent";

  // Wait for fade out of current animation
  setTimeout(function() {
    fadeInNewAnimation(counter);
    updateHeading(counter);
  }, 300);
}

function fadeInNewAnimation(counter) {
  const srcPrefix = (counter % content.length) + 1;

  animation.className = "";
  animation.src = `inline_js/${srcPrefix}.gif`;
}

function updateHeading(counter) {
  heading.className = "";
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
