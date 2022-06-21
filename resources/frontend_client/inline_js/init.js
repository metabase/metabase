const content = [
  ["drill-through-img", "Click on your charts to dive deeper."],
  ["metabot-img shadow", "Bring your charts and data into Slack."],
  ["calendar-img", "Dashboard filters let you filter all your charts at once."],
  ["charts-img shadow", "Easily create and share beautiful dashboards."],
];

const messages = [
  "Polishing tables…",
  "Scaling scalars…",
  "Straightening columns…",
  "Embiggening data…",
  "Reticulating splines…",
];

const animation = document.getElementById("animation");
const heading = document.getElementById("heading");
const progressElement = document.getElementById("progress");
const statusElement = document.getElementById("status");

let counter = 0;

function switcher() {
  setInterval(function() {
    counter++;
    switchAnimation(counter);
  }, 10000);
}

function switchAnimation(counter) {
  animation.className = "transparent";
  // heading.className = "transparent";

  // Wait for fade out of current animation
  setTimeout(function() {
    fadeInNewAnimation(counter);
    // heading.innerHTML = content[counter][1];
    // heading.className = "opaque";
  }, 300);
}

function fadeInNewAnimation(counter) {
  const srcPrefix = (counter % content.length) + 1;

  animation.className = "";
  animation.src = `inline_js/${srcPrefix}.gif`;
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
              statusElement.textContent =
                messages[Math.floor(Math.random() * messages.length)];
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
// poll();
