(function() {
  document.addEventListener("DOMContentLoaded", async function() {
    const MAX_RETRY = 3;

    async function getStatus(retryCount) {
      // status circle is missing
      const $statusCircles = document.querySelectorAll(".status-circle");
      if (!$statusCircles || $statusCircles.length === 0) {
        window.Sentry.captureMessage(`".status-circle" not found`, {
          tags: {
            section: "MB status",
          },
        });
        return;
      }

      try {
        const response = await fetch("https://status.metabase.com/");
        const pageStatusString = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(pageStatusString, "text/html");
        const $pageStatus = doc.querySelector(".page-status");
        if ($pageStatus) {
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

          // set the color
          $statusCircles.forEach(
            ($node) => ($node.style.backgroundColor = statusColor),
          );
        } else {
          window.Sentry.captureMessage(`".page-status" not found`);
        }
      } catch (err) {
        // retry with Sentry message
        if (retryCount + 1 < MAX_RETRY) {
          return await getStatus(retryCount + 1);
        }
        // error
        else {
          window.Sentry.captureException(
            new Error(
              `Fail to load Metabase status: ${err.message ||
                err.status ||
                err.toString()}`,
            ),
          );
        }
      }
    }

    // load
    await getStatus(0);
  });
})();
