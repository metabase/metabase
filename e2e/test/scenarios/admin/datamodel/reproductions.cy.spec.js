import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openReviewsTable,
  popover,
  summarize,
  commandPaletteButton,
  commandPalette,
} from "e2e/support/helpers";

const { PEOPLE_ID, PEOPLE, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 17768", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/Category",
      has_field_values: "list",
    });

    // Sync "Sample Database" schema
    cy.request("POST", `/api/database/${SAMPLE_DB_ID}/sync_schema`);

    waitForFieldSyncToFinish();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/PK",
      has_field_values: "none",
    });
  });

  it("should not show binning options for an entity key, regardless of its underlying type (metabase#17768)", () => {
    openReviewsTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();

    popover().within(() => {
      cy.findByText("ID")
        .closest("[data-element-id=list-section]")
        .realHover()
        .contains("Auto bin")
        .should("not.exist");
    });
  });
});

describe("issue 18384", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Hide Reviews table
    cy.request("PUT", "/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  it("should be able to open field properties even when one of the tables is hidden (metabase#18384)", () => {
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}`,
    );

    cy.findByTestId("column-ADDRESS").find(".Icon-gear").click();

    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}/field/${PEOPLE.ADDRESS}/general`,
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Address – Field Settings/i);
  });
});

describe("issue 21984", () => {
  const reviewsDataModelPage = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}`;
  beforeEach(() => {
    cy.intercept("GET", "/api/table/*/query_metadata?**").as("tableMetadata");

    restore();
    cy.signInAsAdmin();

    cy.visit(reviewsDataModelPage);
    cy.wait("@tableMetadata");

    cy.findByDisplayValue("ID");
  });

  it('should not show data model visited tables in search or in "Pick up where you left off" items on homepage (metabase#21984)', () => {
    cy.visit("/");

    cy.findByTestId("home-page").within(() => {
      // the table should not be in the recents results
      cy.findByText("Reviews").should("not.exist");
    });

    commandPaletteButton().click();
    commandPalette().within(() => {
      cy.findByText("Recent items").should("not.exist");
    });
  });
});

function waitForFieldSyncToFinish(iteration = 0) {
  // 100 x 100ms should be plenty of time for the sync to finish.
  // If it doesn't, we have a much bigger problem than this issue.
  if (iteration === 100) {
    return;
  }

  cy.request("GET", `/api/field/${REVIEWS.ID}`).then(
    ({ body: { fingerprint } }) => {
      if (fingerprint === null) {
        cy.wait(100);

        waitForFieldSyncToFinish(++iteration);
      }

      return;
    },
  );
}
