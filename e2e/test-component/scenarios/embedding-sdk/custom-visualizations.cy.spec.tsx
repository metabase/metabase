import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  CUSTOM_VIZ_DISPLAY,
  CUSTOM_VIZ_FIXTURE_TGZ,
  CUSTOM_VIZ_IDENTIFIER,
  addCustomVizPlugin,
  createQuestion,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { CardId } from "metabase-types/api";

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

  cy.log("Create a question with a regular display, for dropdown selection");
  createQuestion({
    name: "Default Display SDK Question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
    display: "table",
  }).then(({ body: question }) => {
    cy.wrap(question.id).as("defaultDisplayQuestionId");
  });

  cy.signOut();
  mockAuthProviderAndJwtSignIn();
};

describe("scenarios > embedding-sdk > custom visualizations", () => {
  beforeEach(() => {
    setup();
  });

  it("renders the custom visualization when the identifier is in allowedCustomVisualizations", () => {
    cy.get<CardId>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
        sdkProviderProps: {
          allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
        },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText("Custom viz rendered successfully").should("be.visible");
      cy.findByText(/Value: \d+/).should("be.visible");
    });
  });

  it("allows selecting the custom visualization from the chart type dropdown", () => {
    cy.get<CardId>("@defaultDisplayQuestionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
        sdkProviderProps: {
          allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
        },
      });
    });

    getSdkRoot().within(() => {
      cy.log("The default visualization renders first");
      cy.findByText("18,760").should("be.visible");
      cy.findByText("Custom viz rendered successfully").should("not.exist");

      cy.log("The custom viz is listed in the chart type dropdown");
      cy.findByTestId("chart-type-selector-button").click();
      cy.findByRole("listbox").within(() => {
        cy.findByText(CUSTOM_VIZ_IDENTIFIER).click();
      });

      cy.log("Selecting it renders the custom visualization");
      cy.findByText("Custom viz rendered successfully").should("be.visible");
      cy.findByText(/Value: \d+/).should("be.visible");
    });
  });

  it("falls back to the default visualization when the prop is omitted", () => {
    cy.get<CardId>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
        sdkProviderProps: {
          allowedCustomVisualizations: undefined,
        },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText("Custom viz rendered successfully").should("not.exist");
      cy.findByText("18,760").should("be.visible");
    });
  });

  it("falls back to the default visualization when allowedCustomVisualizations is empty", () => {
    cy.get<CardId>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
        sdkProviderProps: {
          allowedCustomVisualizations: [],
        },
      });
    });

    getSdkRoot().within(() => {
      cy.findByText("Custom viz rendered successfully").should("not.exist");
      cy.findByText("18,760").should("be.visible");
    });
  });

  // temporarily disabled (npretto 2026-06-18): we're experimenting with another approach that would not require this new prop
  describe.skip("initialVisualization", () => {
    it("applies a custom visualization as the initial visualization when enabled", () => {
      cy.get<CardId>("@defaultDisplayQuestionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization={CUSTOM_VIZ_DISPLAY}
          />,
          {
            sdkProviderProps: {
              allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
            },
          },
        );
      });

      getSdkRoot().within(() => {
        cy.log("The custom viz renders instead of the saved table display");
        cy.findByText("Custom viz rendered successfully").should("be.visible");
        cy.findByText(/Value: \d+/).should("be.visible");

        cy.log("The chart type dropdown shows the custom viz as selected");
        cy.findByTestId("chart-type-selector-button").should(
          "contain.text",
          CUSTOM_VIZ_IDENTIFIER,
        );
        cy.findByTestId("chart-type-selector-button").click();
        cy.findByRole("listbox")
          .findByRole("option", { name: CUSTOM_VIZ_IDENTIFIER })
          .should("have.attr", "data-combobox-selected", "true");
      });
    });

    it("applies a regular visualization as the initial visualization", () => {
      cy.get<CardId>("@defaultDisplayQuestionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization="scalar"
          />,
        );
      });

      getSdkRoot().within(() => {
        cy.log("The Number viz renders instead of the saved table display");
        cy.findByTestId("scalar-value").should("have.text", "18,760");
        cy.findByTestId("chart-type-selector-button").should(
          "contain.text",
          "Number",
        );
      });
    });

    it("applies the custom visualization when it is both the saved display and the initial visualization", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization={CUSTOM_VIZ_DISPLAY}
          />,
          {
            sdkProviderProps: {
              allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
            },
          },
        );
      });

      getSdkRoot().within(() => {
        cy.log("The custom viz plugin is only loaded once and renders");
        cy.findByText("Custom viz rendered successfully").should("be.visible");
        cy.findByText(/Value: \d+/).should("be.visible");
      });
    });

    it("applies a regular initial visualization over a saved custom display", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization="scalar"
          />,
          {
            sdkProviderProps: {
              allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
            },
          },
        );
      });

      getSdkRoot().within(() => {
        cy.log("The Number viz renders instead of the saved custom display");
        cy.findByTestId("scalar-value").should("have.text", "18,760");
        cy.findByText("Custom viz rendered successfully").should("not.exist");
      });
    });

    it("falls back to the saved visualization when the custom viz is not enabled", () => {
      cy.get<CardId>("@defaultDisplayQuestionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization={CUSTOM_VIZ_DISPLAY}
          />,
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Custom viz rendered successfully").should("not.exist");
        cy.findByText("18,760").should("be.visible");
      });
    });

    it("falls back to the saved visualization when the custom viz doesn't exist", () => {
      cy.get<CardId>("@defaultDisplayQuestionId").then((questionId) => {
        mountSdkContent(
          <InteractiveQuestion
            questionId={questionId}
            initialVisualization="custom:does-not-exist"
          />,
          {
            sdkProviderProps: {
              allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
            },
          },
        );
      });

      getSdkRoot().within(() => {
        cy.findByText("Custom viz rendered successfully").should("not.exist");
        cy.findByText("18,760").should("be.visible");
      });
    });
  });

  describe("allowlist via allowedCustomVisualizations", () => {
    it("renders the custom visualization when the identifier is in the allowlist", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
          sdkProviderProps: {
            allowedCustomVisualizations: [CUSTOM_VIZ_DISPLAY],
          },
        });
      });

      getSdkRoot().within(() => {
        cy.findByText("Custom viz rendered successfully").should("be.visible");
      });
    });

    it("falls back to the default visualization when the identifier is not in the allowlist", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
          sdkProviderProps: {
            allowedCustomVisualizations: ["custom:some-other-plugin"],
          },
        });
      });

      getSdkRoot().within(() => {
        cy.findByText("Custom viz rendered successfully").should("not.exist");
        cy.findByText("18,760").should("be.visible");
      });
    });

    it("falls back to the default visualization when the allowlist is empty", () => {
      cy.get<CardId>("@questionId").then((questionId) => {
        mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
          sdkProviderProps: {
            allowedCustomVisualizations: [],
          },
        });
      });

      getSdkRoot().within(() => {
        cy.findByText("Custom viz rendered successfully").should("not.exist");
        cy.findByText("18,760").should("be.visible");
      });
    });
  });
});
