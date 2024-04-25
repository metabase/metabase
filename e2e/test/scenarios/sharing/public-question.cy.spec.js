import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  filterWidget,
  visitQuestion,
  saveQuestion,
  downloadAndAssert,
  assertSheetRowsCount,
  openNewPublicLinkDropdown,
  createPublicQuestionLink,
  modal,
  openNativeEditor,
} from "e2e/support/helpers";

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
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
  });

  it("adds filters to url as get params and renders the results correctly (metabase#7120, metabase#17033, metabase#21993)", () => {
    cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
      visitQuestion(id);

      // Make sure metadata fully loaded before we continue
      cy.get("[data-testid=cell-data]").contains("Winner");

      openNewPublicLinkDropdown("card");

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
      cy.get("[data-testid=cell-data]").contains("Winner");

      // Make sure we can download the public question (metabase#21993)
      cy.get("@uuid").then(publicUid => {
        downloadAndAssert(
          { fileType: "xlsx", questionId: id, publicUid },
          assertSheetRowsCount(5),
        );
      });
    });
  });

  it("should only allow non-admin users to see a public link if one has already been created", () => {
    cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
      createPublicQuestionLink(id);
      cy.signOut();
      cy.signInAsNormalUser().then(() => {
        visitQuestion(id);

        cy.icon("share").click();

        cy.findByTestId("public-link-popover-content").within(() => {
          cy.findByText("Public link").should("be.visible");
          cy.findByTestId("public-link-input").then($input =>
            expect($input.val()).to.match(PUBLIC_QUESTION_REGEX),
          );
          cy.findByText("Remove public URL").should("not.exist");
        });
      });
    });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public questions", () => {
        cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
          cy.request("POST", `/api/card/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/question/${uuid}`);

              cy.location("search").should("eq", EXPECTED_QUERY_PARAMS);

              filterWidget().contains("Previous 30 Years");
              filterWidget().contains("Affiliate");

              cy.get("[data-testid=cell-data]").contains("Winner");
            },
          );
        });
      });
    }),
  );

  it("should be able to view public questions with snippets", () => {
    openNativeEditor();

    // Create a snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "'test'",
      );
      cy.findByLabelText("Give your snippet a name").type("string 'test'");
      cy.findByText("Save").click();
    });

    cy.get("@editor").type("{moveToStart}select ");

    saveQuestion("test question", { wrapId: true });

    cy.get("@questionId").then(id => {
      createPublicQuestionLink(id).then(({ body: { uuid } }) => {
        cy.signOut();
        cy.signInAsNormalUser().then(() => {
          cy.visit(`/public/question/${uuid}`);
          cy.get("[data-testid=cell-data]").contains("test");
        });
      });
    });
  });

  it("should be able to view public questions with card template tags", () => {
    cy.createNativeQuestion({
      name: "Nested Question",
      native: {
        query: "SELECT * FROM PEOPLE LIMIT 5",
      },
    }).then(({ body: { id } }) => {
      openNativeEditor();

      cy.get("@editor")
        .type("select * from {{#")
        .type(`{leftarrow}{leftarrow}${id}`);

      saveQuestion("test question", { wrapId: true });
      cy.get("@questionId").then(id => {
        createPublicQuestionLink(id).then(({ body: { uuid } }) => {
          cy.signOut();
          cy.signInAsNormalUser().then(() => {
            cy.visit(`/public/question/${uuid}`);
            // Check the name of the first person in the PEOPLE table
            cy.get("[data-testid=cell-data]").contains("Hudson Borer");
          });
        });
      });
    });
  });
});

const visitPublicURL = () => {
  cy.findByTestId("public-link-input")
    .invoke("val")
    .then(publicURL => {
      // Copied URL has no get params
      expect(publicURL).to.match(PUBLIC_QUESTION_REGEX);

      cy.signOut();
      cy.visit(publicURL);
    });
};
