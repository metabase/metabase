import { CreateQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  describeEE,
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

describeEE("scenarios > embedding-sdk > create-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  it("can create a question via the CreateQuestion component", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    cy.intercept("POST", "/api/card").as("createCard");

    mountSdkContent(
      <Flex p="xl">
        <CreateQuestion />
      </Flex>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      // The question title's header should be "New question" by default.
      cy.contains("New question");

      cy.findByRole("button", { name: "Visualize" }).click();

      // Should be able to go back to the editor view
      cy.findByRole("button", { name: "Show editor" }).click();

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
        <CreateQuestion />
      </Flex>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      // The question title's header should be "New question" by default.
      cy.findByText("New question");

      cy.findByRole("button", { name: "Visualize" }).click();

      // Should be able to go back to the editor view
      cy.findByRole("button", { name: "Show editor" }).click();

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
