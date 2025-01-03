import { H } from "e2e/support";
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
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    H.restore();
    cy.signInAsAdmin();

    H.updateSetting("enable-public-sharing", true);
  });

  it("adds filters to url as get params and renders the results correctly (metabase#7120, metabase#17033, metabase#21993)", () => {
    cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
      H.visitQuestion(id);

      // Make sure metadata fully loaded before we continue
      cy.findByTestId("visualization-root").should("be.visible");

      H.openNewPublicLinkDropdown("card");

      // Although we already have API helper `visitPublicQuestion`,
      // it makes sense to use the UI here in order to check that the
      // generated url originally doesn't include query params
      visitPublicURL();

      // On page load, query params are added
      cy.location("search").should("eq", EXPECTED_QUERY_PARAMS);

      H.filterWidget().contains("Previous 30 Years");
      H.filterWidget().contains("Affiliate");

      cy.wait("@publicQuery");

      // Make sure we can download the public question (metabase#21993)
      cy.get("@uuid").then(publicUuid => {
        H.downloadAndAssert(
          { fileType: "xlsx", questionId: id, publicUuid },
          H.assertSheetRowsCount(5),
        );
      });
    });
  });

  it("should only allow non-admin users to see a public link if one has already been created", () => {
    cy.createNativeQuestion(questionData).then(({ body: { id } }) => {
      H.createPublicQuestionLink(id);
      cy.signOut();
      cy.signInAsNormalUser().then(() => {
        H.visitQuestion(id);

        H.openSharingMenu("Public link");

        cy.findByTestId("public-link-popover-content").within(() => {
          cy.findByText("Public link").should("be.visible");
          cy.findByTestId("public-link-input").should($input => {
            expect($input.val()).to.match(PUBLIC_QUESTION_REGEX);
          });
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

              H.filterWidget().contains("Previous 30 Years");
              H.filterWidget().contains("Affiliate");

              cy.findByTestId("visualization-root").should("be.visible");
            },
          );
        });
      });
    }),
  );

  it("should be able to view public questions with snippets", () => {
    H.openNativeEditor();

    // Create a snippet
    cy.icon("snippet").click();
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    H.modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "'test'",
      );
      cy.findByLabelText("Give your snippet a name").type("string 'test'");
      cy.findByText("Save").click();
    });

    cy.get("@editor").type("{moveToStart}select ");

    H.saveQuestion(
      "test question",
      { wrapId: true },
      {
        tab: "Browse",
        path: ["Our analytics"],
      },
    );

    cy.get("@questionId").then(id => {
      H.createPublicQuestionLink(id).then(({ body: { uuid } }) => {
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
      H.openNativeEditor();

      cy.get("@editor")
        .type("select * from {{#")
        .type(`{leftarrow}{leftarrow}${id}`);

      H.saveQuestion(
        "test question",
        { wrapId: true },
        {
          tab: "Browse",
          path: ["Our analytics"],
        },
      );
      cy.get("@questionId").then(id => {
        H.createPublicQuestionLink(id).then(({ body: { uuid } }) => {
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

H.describeEE("scenarios [EE] > public > question", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

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

    cy.get("@questionId").then(id => {
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
  cy.findByTestId("public-link-input").should($input => {
    // Copied URL has no get params
    expect($input.val()).to.match(PUBLIC_QUESTION_REGEX);
  });
  cy.findByTestId("public-link-input")
    .invoke("val")
    .then(publicURL => {
      cy.signOut();
      cy.visit(publicURL);
    });
};
