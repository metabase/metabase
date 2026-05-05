async function findLinearIssue({ githubIssueUrl, linearApiKey }) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: linearApiKey,
    },
    body: JSON.stringify({
      query: `
        query {
          attachmentsForURL(url: "${githubIssueUrl}") {
            nodes {
              issue { identifier }
            }
          }
        }
      `,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, message: `Linear API error: ${response.status}` };
  }

  if (!data.data?.attachmentsForURL?.nodes?.length) {
    return {
      success: false,
      message: `No Linear issue linked to ${githubIssueUrl}`,
    };
  }

  return {
    success: true,
    issue: data.data.attachmentsForURL.nodes[0].issue.identifier,
  };
}

module.exports = { findLinearIssue };
