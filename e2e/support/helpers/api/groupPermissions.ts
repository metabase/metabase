export function addUserToGroup(groupId: number, email: string) {
  return cy
    .request<{ data: Array<{ id: number; email: string }> }>("/api/user")
    .then(({ body }) => {
      const user = body.data.find((candidate) => candidate.email === email);

      if (!user) {
        throw new Error(`No user with the email ${email}`);
      }

      return cy.request("POST", "/api/permissions/membership", {
        group_id: groupId,
        user_id: user.id,
      });
    });
}
