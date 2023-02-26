import { restore } from "e2e/support/helpers";

const questionDetails27105 = {
  name: "27105",
  native: { query: "select current_date::date, 1", "template-tags": {} },
  display: "table",
  visualization_settings: {
    column_settings: {
      '["name","CAST(CURRENT_DATE AS DATE)"]': {
        date_style: "dddd, MMMM D, YYYY",
      },
    },
    "table.pivot_column": "CAST(CURRENT_DATE AS DATE)",
    "table.cell_column": "1",
  },
};

const questionDetails27020 = {
  name: "27020",
  native: {
    query: 'select current_date as "created_at", 1 "val"',
    "template-tags": {},
  },
  visualization_settings: {
    column_settings: { '["name","created_at"]': { date_abbreviate: true } },
    "table.pivot_column": "created_at",
    "table.cell_column": "val",
  },
};

describe("issues 27020 and 27105: static-viz fails to render for certain date formatting options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render static-viz when date formatting is abbreviated (metabase#27020)", () => {
    // This is currently the default setting, anyway.
    // But we want to explicitly set it in case something changes in the future,
    // because it is a crucial step for this reproduction.
    cy.request("PUT", "/api/setting/custom-formatting", {
      value: {
        "type/Temporal": {
          date_style: "MMMM D, YYYY",
        },
      },
    });

    assertStaticVizRenders(questionDetails27020);
  });

  it("should render static-viz when date formatting contains day (metabase#27105)", () => {
    assertStaticVizRenders(questionDetails27105);
  });
});

function assertStaticVizRenders(questionDetails) {
  cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
    cy.request({
      method: "GET",
      url: `/api/pulse/preview_card_png/${id}`,
      failOnStatusCode: false,
    }).then(({ status, body }) => {
      expect(status).to.eq(200);
      expect(body).to.contain("PNG");
    });
  });
}
