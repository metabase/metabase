import {
  restore,
  filterWidget,
  visitQuestion,
  downloadAndAssert,
  assertSheetRowsCount,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

const questionData = {
  name: "Parameterized Public Question",
  native: {
    query: "SELECT * FROM PEOPLE WHERE {{birthdate}} AND {{source}} limit 5",
    "template-tags": {
      birthdate: {
        id: "08c5ea9d-1579-3503-37f1-cbe4d29e6a28",
        name: "birthdate",
        "display-name": "Birthdate",
        type: "dimension",
        dimension: ["field", PEOPLE.BIRTH_DATE, null],
        "widget-type": "date/all-options",
        default: "past30years",
      },
      source: {
        id: "37eb6fa2-3677-91d3-6be0-c5dd9113c672",
        name: "source",
        "display-name": "Source",
        type: "dimension",
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "string/=",
        default: "Affiliate",
      },
    },
  },
};

const PUBLIC_QUESTION_REGEX =
  /\/public\/question\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

const EXPECTED_QUERY_PARAMS = "?birthdate=past30years&source=Affiliate";

const USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
};

describe("scenarios > public > question", () => {
  beforeEach(() => {
    cy.intercept("GET", `/api/public/card/*/query?*`).as("publicQuery");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

    cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
      cy.wrap(id).as("questionId");
    });
  });

  it("adds filters to url as get params and renders the results correctly (metabase#7120, metabase#17033, metabase#21993)", () => {
    cy.get("@questionId").then(id => {
      visitQuestion(id);

      // Make sure metadata fully loaded before we continue
      cy.get(".cellData").contains("Winner");

      cy.icon("share").click();

      enableSharing();
      // Although we already have API helper `visitPublicQuestion`,
      // it makes sense to use the UI here in order to check that the
      // generated url originally doesn't include query params
      visitPublicURL();

      // On page load, query params are added
      cy.location("search").should("eq", EXPECTED_QUERY_PARAMS);

      filterWidget().contains("Previous 30 Years");
      filterWidget().contains("Affiliate");

      cy.wait("@publicQuery");
      // Name of a city from the expected results
      cy.get(".cellData").contains("Winner");

      // Make sure we can download the public question (metabase#21993)
      cy.icon("download").click();
      cy.get("@uuid").then(publicUid => {
        downloadAndAssert(
          { fileType: "xlsx", questionId: id, publicUid },
          assertSheetRowsCount(5),
        );
      });
    });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it(`should be able to view public questions`, () => {
        cy.get("@questionId").then(id => {
          cy.request("POST", `/api/card/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/question/${uuid}`);

              cy.location("search").should("eq", EXPECTED_QUERY_PARAMS);

              filterWidget().contains("Previous 30 Years");
              filterWidget().contains("Affiliate");

              cy.get(".cellData").contains("Winner");
            },
          );
        });
      });
    }),
  );
});

const visitPublicURL = () => {
  // Ideally we would just find the first input
  // but unless we filter by value
  // Cypress finds an input before the copyable inputs are rendered
  cy.findByRole("heading", { name: "Public link" })
    .parent()
    .findByDisplayValue(/^http/)
    .invoke("val")
    .then(publicURL => {
      // Copied URL has no get params
      expect(publicURL).to.match(PUBLIC_QUESTION_REGEX);

      cy.signOut();
      cy.visit(publicURL);
    });
};

const enableSharing = () => {
  cy.intercept("POST", "/api/card/*/public_link").as("sharingEnabled");

  cy.findByRole("heading", { name: "Enable sharing" })
    .parent()
    .findByRole("switch")
    .check();

  cy.wait("@sharingEnabled").then(
    ({
      response: {
        body: { uuid },
      },
    }) => {
      cy.wrap(uuid).as("uuid");
    },
  );
};
