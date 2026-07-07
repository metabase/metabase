const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, ORDERS_ID } = SAMPLE_DATABASE;

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

const USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
};

describe("scenarios > public > question", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    H.restore();
    cy.signInAsAdmin();

    H.updateSetting("enable-public-sharing", true);
  });

  it("adds filters to url as get params and renders the results correctly (metabase#7120, metabase#17033, metabase#21993)", () => {
    H.createNativeQuestion(questionData).then(({ body: { id } }) => {
      H.visitQuestion(id);

      // Make sure metadata fully loaded before we continue
      cy.findByTestId("visualization-root").should("be.visible");

      H.openNewPublicLinkDropdown("card");

      // Although we already have API helper `visitPublicQuestion`,
      // it makes sense to use the UI here in order to check that the
      // generated url originally doesn't include query params
      visitPublicURL();

      // On page load, query params are added
      cy.location("search").should("include", "source=Affiliate");
      cy.location("search").should("include", "birthdate=past30years");

      H.filterWidget().contains("Previous 30 years");
      H.filterWidget().contains("Affiliate");

      cy.wait("@publicQuery");

      // Make sure we can download the public question (metabase#21993)
      cy.get("@uuid").then((publicUuid) => {
        H.main().realHover();

        H.downloadAndAssert({ fileType: "xlsx", questionId: id, publicUuid });
      });
    });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public questions", () => {
        H.createNativeQuestion(questionData).then(({ body: { id } }) => {
          cy.request("POST", `/api/card/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/question/${uuid}`);

              cy.location("search").should("include", "source=Affiliate");
              cy.location("search").should("include", "birthdate=past30years");

              H.filterWidget().contains("Previous 30 years");
              H.filterWidget().contains("Affiliate");

              cy.findByTestId("visualization-root").should("be.visible");
            },
          );
        });
      });
    }),
  );

  it("should support #theme=dark (metabase#65731)", () => {
    const questionName = "Orders Theme Test";
    H.createQuestion({
      name: questionName,
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: { id } }) => {
      H.visitPublicQuestion(id, {
        hash: {
          theme: "dark",
        },
      });
    });

    cy.log("dark theme should have white text");
    cy.findByRole("heading", {
      name: questionName,
    }).should("have.css", "color", "rgba(255, 255, 255, 0.95)");
  });
});

describe("scenarios [EE] > public > question", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    H.updateSetting("enable-public-sharing", true);
  });

  it("should allow to set locale from the `#locale` hash parameter (metabase#50182)", () => {
    H.createNativeQuestion(
      {
        name: "Native question with a parameter",
        native: {
          query:
            "select '2025-2-11'::DATE as date, {{some_parameter}} as some_parameter ",
          "template-tags": {
            some_parameter: {
              type: "text",
              name: "some_parameter",
              id: "1e0806a0-155b-4e24-80bc-c050720201d0",
              "display-name": "Some Parameter",
              default: "some default value",
            },
          },
        },
      },
      { wrapId: true },
    );

    // We don't have a de-CH.json file, so it should fallback to de.json, see metabase#51039 for more details
    cy.intercept("/app/locales/de.json").as("deLocale");

    cy.get("@questionId").then((id) => {
      H.visitPublicQuestion(id, {
        params: {
          some_parameter: "some_value",
        },
        hash: {
          locale: "de-CH",
        },
      });
    });

    cy.wait("@deLocale");

    H.main().findByText("Februar 11, 2025");

    cy.url().should("include", "locale=de");
  });
});

const visitPublicURL = () => {
  cy.findByTestId("public-link-input").should(($input) => {
    // Copied URL has no get params
    expect($input.val()).to.match(PUBLIC_QUESTION_REGEX);
  });
  cy.findByTestId("public-link-input")
    .invoke("val")
    .then((publicURL) => {
      cy.signOut();
      cy.visit(publicURL);
    });
};
