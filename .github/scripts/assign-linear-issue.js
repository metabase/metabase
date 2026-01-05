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
  // Get the sender's email from GitHub, fall back to constructed email
  let senderEmail;
  try {
    const userResponse = await github.rest.users.getByUsername({
      username: senderLogin,
    });
    senderEmail = userResponse.data.email || `${senderLogin}@metabase.com`;
  } catch {
    senderEmail = `${senderLogin}@metabase.com`;
  }

  // Find the Linear user by email
  const userResponse = await linearGraphQL(
    `
    query {
      users(filter: { email: { eq: "${senderEmail}" } }) {
        nodes { id name }
      }
    }
  `,
    linearApiKey,
  );

  if (!userResponse.data?.users?.nodes?.length) {
    return {
      success: false,
      reason: `No Linear user found for ${senderEmail}`,
    };
  }

  const linearUser = userResponse.data.users.nodes[0];

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

async function linkPrToLinearIssue({ issueUrl, prUrl, linearApiKey }) {
  const issueResponse = await linearGraphQL(
    `
    query {
      attachmentsForURL(url: "${issueUrl}") {
        nodes {
          issue { id identifier }
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

  const attachResponse = await linearGraphQL(
    `
    mutation {
      attachmentCreate(input: { issueId: "${linearIssue.id}", url: "${prUrl}", title: "GitHub PR" }) {
        success
      }
    }
  `,
    linearApiKey,
  );

  if (attachResponse.data?.attachmentCreate?.success) {
    return { success: true, issue: linearIssue.identifier };
  }

  return { success: false, reason: "Attachment creation failed" };
}

module.exports = { assignLinearIssue, linkPrToLinearIssue };
