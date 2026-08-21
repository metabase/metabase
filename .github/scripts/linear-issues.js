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

async function createLinearIssue({
  teamId,
  title,
  description,
  projectId,
  labelIds,
  linearApiKey,
}) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: linearApiKey,
    },
    body: JSON.stringify({
      query: `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      `,
      variables: {
        input: {
          teamId,
          title,
          ...(description ? { description } : {}),
          ...(projectId ? { projectId } : {}),
          ...(labelIds?.length ? { labelIds } : {}),
        },
      },
    }),
  });

  if (!response.ok) {
    return { success: false, message: `Linear API error: ${response.status}` };
  }

  const data = await response.json();

  if (data.errors?.length) {
    return {
      success: false,
      message: `Linear API error: ${data.errors.map((e) => e.message).join(", ")}`,
    };
  }

  if (!data.data?.issueCreate?.success) {
    return {
      success: false,
      message: `Failed to create Linear issue "${title}"`,
    };
  }

  return {
    success: true,
    issue: data.data.issueCreate.issue,
  };
}

module.exports = {
  findLinearIssue,
  createLinearIssue,
};
