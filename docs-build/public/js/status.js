// Vendored from the marketing site's status.js. The marketing original
// reports DOM and fetch failures via window.Sentry, which the docs build
// does not load — those calls were stripped here. See
// docs/developers-guide/docs.md (Marketing-site chrome) for context.
(function() {
  document.addEventListener("DOMContentLoaded", async function() {
    const MAX_RETRY = 3;

    async function getStatus(retryCount) {
      const $statusCircles = document.querySelectorAll(".status-circle");
      if ($statusCircles.length === 0) return;

      try {
        const response = await fetch("https://status.metabase.com/");
        const pageStatusString = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(pageStatusString, "text/html");
        const $pageStatus = doc.querySelector(".page-status");
        if (!$pageStatus) return;

        const pageStatusClasses = $pageStatus.classList;
        let statusColor = "#84BB4C";
        if (
          pageStatusClasses.contains("status-minor") ||
          pageStatusClasses.contains("status-major")
        ) {
          statusColor = "#F9CF48";
        } else if (pageStatusClasses.contains("status-critical")) {
          statusColor = "#ED6E6E";
        } else if (pageStatusClasses.contains("status-maintenance")) {
          statusColor = "#509EE3";
        }

        $statusCircles.forEach(
          ($node) => ($node.style.backgroundColor = statusColor),
        );
      } catch (err) {
        if (retryCount + 1 < MAX_RETRY) {
          return await getStatus(retryCount + 1);
        }
        console.warn("Failed to load Metabase status:", err);
      }
    }

    await getStatus(0);
  });
})();
