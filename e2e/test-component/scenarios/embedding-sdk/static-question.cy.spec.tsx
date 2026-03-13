const { H } = cy;

import {
  MetabaseProvider,
  StaticQuestion,
  type StaticQuestionProps,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, modal, popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
  mountStaticQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > static-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show question content", () => {
    mountStaticQuestion();

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Max of Quantity").should("be.visible");

      cy.log("should not show question title by default");
      cy.findByText("47563").should("not.exist");
    });
  });

  it("should not render the top bar when it has no visible children, and restore it when children appear", () => {
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/user/current").as("getUser");

    cy.get<number>("@questionId").then((questionId) => {
      const consoleErrorSpy = cy.spy(console, "error").as("consoleError");

      const renderQuestion = (props: Partial<StaticQuestionProps>) => (
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <StaticQuestion questionId={questionId} {...props} />
        </MetabaseProvider>
      );

      mountSdk(
        renderQuestion({ title: false, withChartTypeSelector: false }),
      ).then(({ rerender }) => {
        cy.wait("@getUser");
        cy.wait("@getCard");

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByTestId("static-question-top-bar").should("not.exist");
        });

        rerender(renderQuestion({ title: true, withChartTypeSelector: false }));

        getSdkRoot().within(() => {
          cy.findByTestId("static-question-top-bar")
            .should("exist")
            .and("be.visible");
        });

        rerender(
          renderQuestion({ title: false, withChartTypeSelector: false }),
        );

        getSdkRoot().within(() => {
          cy.findByTestId("static-question-top-bar").should("not.exist");
        });

        rerender(renderQuestion({ title: false, withDownloads: true }));

        getSdkRoot().within(() => {
          cy.findByTestId("static-question-top-bar")
            .should("exist")
            .and("be.visible");
        });

        rerender(renderQuestion({ title: false, withDownloads: false }));

        getSdkRoot().within(() => {
          cy.findByTestId("static-question-top-bar").should("not.exist");
        });

        cy.then(() => {
          const refWarningCalls = consoleErrorSpy
            .getCalls()
            .filter((call: sinon.SinonSpyCall) =>
              String(call.args[0]).includes("cannot be given refs"),
            );

          expect(refWarningCalls).to.have.length(0);
        });
      });
    });
  });

  it("should show question title", () => {
    mountStaticQuestion({ title: true });

    getSdkRoot().within(() => {
      cy.findByText("47563").should("be.visible");
    });
  });

  it("should show custom question title", () => {
    mountStaticQuestion({ title: "Acme Inc" });

    getSdkRoot().within(() => {
      cy.findByText("47563").should("not.exist");
      cy.findByText("Acme Inc").should("be.visible");
    });
  });

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        questionIdAlias: "@questionEntityId",
      },
      {
        name: "correct number ID",
        questionIdAlias: "@questionId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        questionId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        questionId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        questionId: 9999,
      },
    ];

    successTestCases.forEach(({ name, questionIdAlias }) => {
      it(`should load question content for ${name}`, () => {
        cy.get<number>(questionIdAlias).then((questionId) => {
          mountStaticQuestion({ questionId });
        });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, questionId }) => {
      it(`should show an error message for ${name}`, () => {
        mountStaticQuestion({ questionId }, { shouldAssertCardQuery: false });

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Question ${questionId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);
          cy.findByText("Product ID").should("not.exist");
          cy.findByText("Max of Quantity").should("not.exist");
        });
      });
    });
  });

  describe("alerts button", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setupSMTP();
      cy.signOut();
    });

    it("should be able to create, edit, and delete alerts", () => {
      mountStaticQuestion({
        withAlerts: true,
      });

      cy.log("alerts button is visible and clickable");
      getSdkRoot().button("Alerts").should("be.visible").click();

      cy.log("alerts modal is open");
      modal().within(() => {
        cy.findByRole("heading", { name: "New alert" }).should("be.visible");
        cy.button("Done").click();
      });
      modal().should("not.exist");

      cy.log("alerts list modal");
      getSdkRoot().button("Alerts").should("be.visible").click();
      modal().within(() => {
        cy.findByRole("heading", { name: "Edit alerts" }).should("be.visible");
        cy.findByText("Alert when this has results").should("be.visible");
        cy.findByText("admin@metabase.test").should("be.visible");
        cy.findByText("Check daily at 8:00 AM").should("be.visible").click();

        cy.findByRole("heading", { name: "Edit alert" }).should("be.visible");
        // The second input is a hidden input, so we need to ignore it.
        cy.findAllByDisplayValue("daily").first().click();
      });

      popover().findByRole("option", { name: "weekly" }).click();
      modal().within(() => {
        cy.button("Save changes").click();
        cy.findByRole("heading", { name: "Edit alerts" }).should("be.visible");
        cy.findByText("Check on Monday at 8:00 AM").should("be.visible");
      });

      cy.log("delete the alert");
      modal().within(() => {
        cy.findByText("Check on Monday at 8:00 AM").realHover();
        cy.button("Delete this alert").click();

        cy.findByRole("heading", { name: "Delete this alert?" }).should(
          "be.visible",
        );
        cy.button("Delete it").click();
      });

      cy.log("the alert is deleted");
      getSdkRoot().button("Alerts").should("be.visible").click();
      modal().findByRole("heading", { name: "New alert" }).should("be.visible");
    });
  });
});
