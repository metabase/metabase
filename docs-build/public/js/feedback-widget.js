// "Was this helpful?" widget. Posts votes and comments to the CRM
// feedback endpoint that the live metabase.com docs already use, so feedback
// from this build lands in the same bucket. The markup is in
// src/components/FeedbackWidget.astro.
(function () {
  const widget = document.getElementById("was-this-helpful-widget");
  if (!widget) return;

  const ENDPOINT = "https://store-api.metabase.com/api/v1/crm/learn-feedback";
  const UP_PROMPT = "What did you find especially helpful?";
  const DOWN_PROMPT = "How can we improve this article?";

  const state = {
    article_url: window.location.href,
    article_title: document.title,
    article_section: getSection(window.location.href),
  };

  // Map a pathname to the corresponding markdown source on GitHub.
  // Strips the `/docs/(latest|v0.NN)/` prefix and appends the right extension:
  //   /docs/latest/         → README.md
  //   /docs/latest/foo/     → foo/index.md   (directory index page)
  //   /docs/latest/foo/bar  → foo/bar.md
  function toGithubUrl(pathname) {
    const stripped = pathname.replace(/^\/docs\/(?:latest|v\d+\.\d+)\/?/, "");
    let file;
    if (stripped === "") {
      file = "README.md";
    } else if (stripped.endsWith("/")) {
      file = stripped + "index.md";
    } else {
      file = stripped + ".md";
    }
    return "https://github.com/metabase/metabase/blob/master/docs/" + file;
  }

  // Section is the first path segment after /docs/<version>/, e.g.
  //   /docs/latest/databases/postgresql → "databases"
  // Empty (the landing page) falls back to "Docs".
  function getSection(url) {
    const m = url.match(/\/docs\/(?:latest|v\d+\.\d+)\/([^/]+)/);
    return m ? m[1] : "Docs";
  }

  function renderFooter(isHelpful) {
    const gh = toGithubUrl(window.location.pathname);
    if (isHelpful === null) {
      return (
        'Want to improve these docs? <a href="' +
        gh +
        '" target="_blank" rel="noopener">Propose a change.</a>'
      );
    }
    if (isHelpful) {
      return (
        'Want to improve these docs? <a href="' +
        gh +
        '" target="_blank" rel="noopener">Propose a change.</a>'
      );
    }
    return (
      'Need some help? <a href="https://www.metabase.com/help/">We\'re right here.</a> ' +
      'Want to improve these docs? <a href="' +
      gh +
      '" target="_blank" rel="noopener">Propose a change.</a>'
    );
  }

  async function postFeedback(body) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  const voteUp = document.getElementById("page-feedback-vote-up");
  const voteDown = document.getElementById("page-feedback-vote-down");
  const commentPanel = document.getElementById("page-comment");
  const commentQuestion = document.getElementById("page-feedback-question");
  const commentText = document.getElementById("feedback-comment-text");
  const commentSubmit = document.getElementById("page-comment-submit");
  const commentForm = document.getElementById("page-comment-form");
  const thanks = document.getElementById("page-feedback-message");
  const footer = document.getElementById("page-feedback-footer");

  // Initial footer — visible before any interaction.
  footer.innerHTML = renderFooter(null);

  function handleVote(isHelpful) {
    return function (ev) {
      ev.preventDefault();
      voteUp.classList.toggle("active", isHelpful);
      voteDown.classList.toggle("active", !isHelpful);

      commentQuestion.innerText = isHelpful ? UP_PROMPT : DOWN_PROMPT;
      commentPanel.classList.remove("hide");
      commentText.focus();
      footer.innerHTML = renderFooter(isHelpful);

      state.helpful = isHelpful;
      postFeedback(state)
        .then(({ feedback_id }) => {
          state.id = feedback_id;
        })
        .catch((err) => console.error("feedback vote failed", err));
    };
  }

  function submitComment(ev) {
    ev.preventDefault();
    const comment = commentText.value.trim();
    if (!comment) {
      alert("Please add a comment before hitting the Send button.");
      return;
    }
    if (comment.length > 500) {
      alert("Comments cannot exceed 500 characters.");
      return;
    }
    commentPanel.classList.add("hide");
    thanks.classList.remove("hide");
    state.comments = comment;
    postFeedback(state).catch((err) =>
      console.error("feedback comment failed", err),
    );
  }

  voteUp.addEventListener("click", handleVote(true));
  voteDown.addEventListener("click", handleVote(false));
  commentSubmit.addEventListener("click", submitComment);
  commentForm.addEventListener("submit", submitComment);
})();
