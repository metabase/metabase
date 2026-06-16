import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  CUSTOM_VIZ_DISPLAY,
  CUSTOM_VIZ_FIXTURE_TGZ,
  addCustomVizPlugin,
  createQuestion,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const setup = () => {
  signInAsAdminAndEnableEmbeddingSdk();

  cy.log("Turn on the prereqs for custom visualizations");
  cy.request("PUT", "/api/setting", {
    "csp-img-enabled": true, // csp-img is required to enable custom-viz
    "custom-viz-enabled": true,
  });

  cy.log("Upload the demo-viz custom visualization plugin");
  addCustomVizPlugin(CUSTOM_VIZ_FIXTURE_TGZ);

  cy.log("Create a question that targets the demo-viz custom display");
  // demo-viz expects exactly one row with one numeric column.
  createQuestion({
    name: "Custom Viz SDK Question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    display: CUSTOM_VIZ_DISPLAY,
  }).then(({ body: question }) => {
    cy.wrap(question.id).as("questionId");
  });

  cy.signOut();
  mockAuthProviderAndJwtSignIn();
};

describe("scenarios > embedding-sdk > custom visualizations", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the custom visualization in the SDK", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    getSdkRoot().within(() => {
      cy.findByText("Custom viz rendered successfully").should("be.visible");
      cy.findByText(/Value: \d+/).should("be.visible");
    });
  });
});
