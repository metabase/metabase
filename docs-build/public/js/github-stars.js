(function() {
  window.addEventListener("DOMContentLoaded", async () => {
    const MAX_RETRY = 3;

    async function getGithubData(retryCount) {
      // github stars is missing
      const $githubStars = document.querySelectorAll(".github-stars");
      if (!$githubStars || $githubStars.length === 0) {
        window.Sentry.captureMessage(".github-stars not found", {
          tags: {
            section: "GH stars",
          },
        });
        return;
      }

      try {
        const response = await fetch(
          "https://api.github.com/repos/metabase/metabase",
        );
        const githubData = await response.json();
        const starsCount = Math.ceil(githubData.stargazers_count / 100) / 10;
        $githubStars.forEach(($node) => ($node.innerHTML = `${starsCount}k`));
      } catch (err) {
        // retry with Sentry message
        if (retryCount + 1 < MAX_RETRY) {
          return await getGithubData(retryCount + 1);
        }
        // error
        else {
          window.Sentry.captureException(
            new Error(
              `Fail to load GitHub data: ${err.message ||
                err.status ||
                err.toString()}`,
            ),
          );
        }
      }
    }

    // load
    await getGithubData(0);
  });
})();
