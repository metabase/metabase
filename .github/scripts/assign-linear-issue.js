async function linearGraphQL(query, linearApiKey) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: linearApiKey,
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data;
}

async function assignLinearIssue({
  github,
  issueUrl,
  senderLogin,
  linearApiKey,
}) {
  // Get the sender's email from GitHub
  const githubUser = await github.rest.users.getByUsername({
    username: senderLogin,
  });
  const senderEmail = githubUser.data.email;

  if (!senderEmail) {
    return {
      success: false,
      reason: `GitHub user ${senderLogin} has no public email`,
    };
  }

  // Find the Linear user by email
  const linearUserResponse = await linearGraphQL(
    `
    query {
      users(filter: { email: { eq: "${senderEmail}" } }) {
        nodes { id name }
      }
    }
  `,
    linearApiKey,
  );

  if (!linearUserResponse.data?.users?.nodes?.length) {
    return {
      success: false,
      reason: `No Linear user found for ${senderEmail}`,
    };
  }

  const linearUser = linearUserResponse.data.users.nodes[0];

  // Find the Linear issue linked to this GitHub issue
  const issueResponse = await linearGraphQL(
    `
    query {
      attachmentsForURL(url: "${issueUrl}") {
        nodes {
          issue {
            id
            identifier
            title
            assignee { name }
          }
        }
      }
    }
  `,
    linearApiKey,
  );

  if (!issueResponse.data?.attachmentsForURL?.nodes?.length) {
    return { success: false, reason: `No Linear issue linked to ${issueUrl}` };
  }

  const linearIssue = issueResponse.data.attachmentsForURL.nodes[0].issue;

  if (linearIssue.assignee) {
    return {
      success: true,
      alreadyAssigned: true,
      issue: linearIssue.identifier,
      assignee: linearIssue.assignee.name,
    };
  }

  const assignResponse = await linearGraphQL(
    `
    mutation {
      issueUpdate(id: "${linearIssue.id}", input: { assigneeId: "${linearUser.id}" }) {
        success
      }
    }
  `,
    linearApiKey,
  );

  if (assignResponse.data?.issueUpdate?.success) {
    return {
      success: true,
      issue: linearIssue.identifier,
      assignee: linearUser.name,
    };
  }

  return { success: false, reason: "Assignment mutation failed" };
}

module.exports = { assignLinearIssue };
