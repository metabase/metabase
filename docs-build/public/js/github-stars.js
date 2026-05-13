// Vendored from the marketing site's github-stars.js. The marketing original
// reports DOM and fetch failures via window.Sentry, which the docs build
// does not load — those calls were stripped here.
(function() {
  window.addEventListener("DOMContentLoaded", async () => {
    const MAX_RETRY = 3;

    async function getGithubData(retryCount) {
      const $githubStars = document.querySelectorAll(".github-stars");
      if ($githubStars.length === 0) return;

      try {
        const response = await fetch(
          "https://api.github.com/repos/metabase/metabase",
        );
        const githubData = await response.json();
        const starsCount = Math.ceil(githubData.stargazers_count / 100) / 10;
        $githubStars.forEach(($node) => ($node.innerHTML = `${starsCount}k`));
      } catch (err) {
        if (retryCount + 1 < MAX_RETRY) {
          return await getGithubData(retryCount + 1);
        }
        console.warn("Failed to load GitHub data:", err);
      }
    }

    await getGithubData(0);
  });
})();
