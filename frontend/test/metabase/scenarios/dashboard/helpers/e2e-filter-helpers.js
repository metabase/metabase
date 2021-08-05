export function addFiltersToDashboard(dashboardId) {
  cy.request("PUT", `/api/dashboard/${dashboardId}`, {
    parameters: [
      { name: "ID", slug: "id", id: "729b6456", type: "id" },
      { name: "ID 1", slug: "id_1", id: "bb20f59e", type: "id" },
      {
        name: "Category",
        slug: "category",
        id: "89873480",
        type: "category",
      },
      {
        name: "Category 1",
        slug: "category_1",
        id: "cbc045f2",
        type: "category",
      },
    ],
  });
}
