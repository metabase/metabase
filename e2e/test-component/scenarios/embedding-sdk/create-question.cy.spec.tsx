import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  modal,
  popover,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Flex } from "metabase/ui";

describe("scenarios > embedding-sdk > interactive-question > creating a question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  describe("simple data picker", () => {
    it("can create a question via the InteractiveQuestion component", () => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion />
        </Flex>,
      );

      // Wait until the entity picker modal is visible
      getSdkRoot().contains("Pick your starting data");

      popover().findByText("Orders").click();
      getSdkRoot().within(() => {
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "pencil_lines icon" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");

        // Should be able to save to a new question right away
        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?")
          .clear()
          .type("My Orders");

        cy.findByTestId("dashboard-and-collection-picker-button").click();
      });

      entityPickerModal().within(() => {
        entityPickerModalTab("Browse").click();
        cy.findByText("First collection").click();
        cy.button("Select this collection").click();
      });

      modal().button("Save").click();

      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("My Orders");
        expect(response?.body?.dashboard_id).to.equal(null);
        expect(response?.body?.collection_id).to.equal(FIRST_COLLECTION_ID);
      });

      // The question title's header should be updated.
      getSdkRoot().contains("My Orders");
    });

    it("can save a question in a dashboard", () => {
      createQuestion({
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion />
        </Flex>,
      );

      // Wait until the entity picker modal is visible
      getSdkRoot().contains("Pick your starting data");

      popover().findByText("Orders").click();

      getSdkRoot().within(() => {
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "pencil_lines icon" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");

        // Should be able to save to a new question right away
        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?")
          .clear()
          .type("My Orders");

        cy.findByTestId("dashboard-and-collection-picker-button").click();
      });

      entityPickerModal().within(() => {
        entityPickerModalTab("Browse").click();
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select this dashboard").click();
      });

      modal().button("Save").click();

      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("My Orders");
        expect(response?.body?.dashboard_id).to.equal(ORDERS_DASHBOARD_ID);
        expect(response?.body?.collection_id).to.equal(null);
      });

      // The question title's header should be updated.
      getSdkRoot().contains("My Orders");
    });
  });

  describe("multi-stage picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*", req => {
        if (req.query.limit === "0") {
          req.continue(res => {
            // The data picker will fall back to multi-stage picker if there are more than or equal 100 tables and models
            res.body.total = 100;
          });
        }
      });
    });
    it("can create a question via the InteractiveQuestion component", () => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion />
        </Flex>,
      );

      // Wait until the entity picker modal is visible
      getSdkRoot().contains("Pick your starting data");

      popover().within(() => {
        cy.findByText("Raw Data").click();
        cy.findByText("Orders").click();
      });

      getSdkRoot().within(() => {
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "pencil_lines icon" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");

        // Should be able to save to a new question right away
        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?")
          .clear()
          .type("My Orders");

        cy.findByTestId("dashboard-and-collection-picker-button").click();
      });

      entityPickerModal().within(() => {
        entityPickerModalTab("Browse").click();
        cy.findByText("First collection").click();
        cy.button("Select this collection").click();
      });

      modal().button("Save").click();

      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("My Orders");
        expect(response?.body?.dashboard_id).to.equal(null);
        expect(response?.body?.collection_id).to.equal(FIRST_COLLECTION_ID);
      });

      // The question title's header should be updated.
      getSdkRoot().contains("My Orders");
    });

    it("can save a question in a dashboard", () => {
      createQuestion({
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion />
        </Flex>,
      );

      // Wait until the entity picker modal is visible
      getSdkRoot().contains("Pick your starting data");

      popover().within(() => {
        cy.findByText("Raw Data").click();
        cy.findByText("Orders").click();
      });

      getSdkRoot().within(() => {
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should be able to go back to the editor view
        // TODO: SDK: make this accessible
        cy.findByRole("button", { name: "pencil_lines icon" }).click();

        // Should be able to visualize the question again
        cy.findByRole("button", { name: "Visualize" }).click();

        // Should not show a loading indicator again as the question has not changed (metabase#47564)
        cy.findByTestId("loading-indicator").should("not.exist");

        // Should be able to save to a new question right away
        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?")
          .clear()
          .type("My Orders");

        cy.findByTestId("dashboard-and-collection-picker-button").click();
      });

      entityPickerModal().within(() => {
        entityPickerModalTab("Browse").click();
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select this dashboard").click();
      });

      modal().button("Save").click();

      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("My Orders");
        expect(response?.body?.dashboard_id).to.equal(ORDERS_DASHBOARD_ID);
        expect(response?.body?.collection_id).to.equal(null);
      });

      // The question title's header should be updated.
      getSdkRoot().contains("My Orders");
    });
  });
});
