import { restore, visitDashboard, getDashboardCard } from "e2e/support/helpers";

const questionDetails = {
  name: "18996",
  native: {
    query: `
select 1 "ID", 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg' "IMAGE", 123 "PRICE"
union all select 2, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
union all select 3, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
union all select 4, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
union all select 5, null, 123
union all select 6, '', 123
union all select 7, 'non-exisiting', 123
union all select 8, null, 123
union all select 9, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
union all select 10, 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/TEST.jpg/320px-TEST.jpg', 123
`,
  },
  display: "table",
  visualization_settings: {
    "table.cell_column": "ID",
    "table.pivot_column": "PRICE",
    column_settings: {
      '["name","IMAGE"]': {
        view_as: "image",
      },
    },
  },
};

describe("issue 18996", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should navigate between pages in a table with images in a dashboard (metabase#18996)", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);
    });

    getDashboardCard().within(() => {
      cy.findByText(/Rows \d+-\d+ of 10/).should("be.visible");
      cy.icon("chevronright").click();
      cy.findByText(/Rows \d+-\d+ of 10/).should("be.visible");
    });
  });
});
