const { H } = cy;
import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { modal, popover } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createNativeQuestion(
      {
        name: "SQL Orders",
        native: { query: "select * from ORDERS limit 5" },
      },
      {
        wrapId: true,
        idAlias: "sqlQuestionId",
      },
    );
    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should be able to drill SQL question (EMB-273)", () => {
    cy.get<number>("@sqlQuestionId").then((sqlQuestionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={sqlQuestionId} withParameters />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("SQL Orders").should("be.visible");
      H.assertTableRowsCount(5);

      // Drill down to "See these Orders"
      cy.get("[data-dataset-index=0] > [data-column-id='PRODUCT_ID']")
        .should("have.text", "14")
        .click();
      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
        cy.button(">").click();
      });
      H.assertTableRowsCount(4);
    });
  });

  it("should be able to edit a native question with the QueryEditor", () => {
    cy.intercept("GET", "/api/database").as("schema");

    cy.get("@sqlQuestionId").then((sqlQuestionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={sqlQuestionId} withParameters />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("SQL Orders").should("be.visible");
      H.assertTableRowsCount(5);

      cy.findByTestId("notebook-button").click();
      cy.findByTestId("native-query-editor").should("be.visible");
      cy.wait("@schema");

      H.NativeEditor.value().should("equal", "select * from ORDERS limit 5");
      cy.findByRole("textbox").should("be.visible").click();

      H.NativeEditor.type("{movetoend}{backspace}10");

      H.NativeEditor.clickOnRun();

      cy.button("Visualize").should("be.visible").click();

      H.assertTableRowsCount(10);
    });
  });

  it("should be able to create a native question with the QueryEditor", () => {
    cy.intercept("GET", "/api/database?can-query=true").as("schema");

    mountSdkContent(
      <InteractiveQuestion questionId="new-native" withParameters />,
    );

    getSdkRoot().within(() => {
      cy.findByTestId("native-query-editor").should("be.visible");
      cy.findByLabelText("placeholder SELECT * FROM TABLE_NAME").should(
        "be.visible",
      );

      cy.wait("@schema");

      H.NativeEditor.type("SELECT * from ORDERS LIMIT 10");

      H.NativeEditor.clickOnRun();

      cy.button("Visualize").should("be.visible").click();

      H.assertTableRowsCount(10);
    });
  });

  describe("alerts button", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setupSMTP();
      cy.signOut();
    });

    it("should be able to create, edit, and delete alerts", () => {
      cy.get<number>("@sqlQuestionId").then((sqlQuestionId) => {
        mountSdkContent(
          <InteractiveQuestion questionId={sqlQuestionId} withAlerts />,
        );
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
