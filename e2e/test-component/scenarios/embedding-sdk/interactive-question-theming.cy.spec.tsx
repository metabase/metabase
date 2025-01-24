import {
  InteractiveQuestion,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, describeEE } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Box } from "metabase/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SAMPLE_THEME = {
  fontFamily: "Inter",
  fontSize: "14px",
  colors: {
    brand: "rgb(223, 117, 233)",
    "brand-hover": "rgb(122, 187, 249)",
    "brand-hover-light": "rgb(122, 187, 249)",
    filter: "rgb(122, 187, 249)",
    "text-primary": "rgb(227, 231, 228)",
    "text-secondary": "rgb(227, 231, 228)",
    "text-tertiary": "rgb(173, 171, 169)",
    border: "rgb(59, 63, 63)",
    background: "rgb(22, 26, 29)",
    "background-secondary": "rgb(59, 63, 63)",
    "background-hover": "rgb(22, 26, 29)",
    "background-disabled": "rgb(59, 63, 63)",
    charts: [
      "rgb(223, 117, 233)",
      "rgb(122, 187, 249)",
      "rgb(237, 106, 90)",
      "rgb(254, 209, 140)",
      "rgb(130, 167, 75)",
      "rgb(255, 141, 105)",
      "rgb(237, 106, 90)",
      "rgb(254, 209, 140)",
    ],
    positive: "rgb(69, 223, 76)",
    negative: "rgb(255, 51, 137)",
  },
  components: {
    cartesian: {
      padding: "6px 16px",
    },
    dashboard: {
      card: {
        border: '"1px solid rgb(22, 26, 29)"',
        backgroundColor: "rgb(33, 36, 38)",
      },
    },
    number: {
      value: {
        fontSize: "18px",
        lineHeight: "22px",
      },
    },
  },
} satisfies MetabaseTheme;

describeEE("scenarios > embedding-sdk > interactive-question > theming", () => {
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
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should apply theme values to interactive question's default layout", () => {
    cy.get<number>("@questionId").then(questionId => {
      mountSdkContent(
        <Box bg="#161A1D">
          <InteractiveQuestion questionId={questionId} />
        </Box>,
        { theme: SAMPLE_THEME },
      );
    });

    const questionTheme = SAMPLE_THEME.components.question;

    const testIdToThemeBackgroundColorMap = {
      "interactive-question-result-toolbar":
        questionTheme.toolbar.backgroundColor,
      "chart-type-selector-button":
        questionTheme.chartTypeSelector.backgroundColor,
      "question-settings-toolbar-button":
        questionTheme.questionSettingsButton.backgroundColor,
      "notebook-button": questionTheme.editorButton.backgroundColor,
    } satisfies Record<string, string>;

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      for (const [testId, backgroundColor] of Object.entries(
        testIdToThemeBackgroundColorMap,
      )) {
        cy.findByTestId(testId).should(
          "have.css",
          "background-color",
          backgroundColor,
        );
      }

      cy.findByTestId("notebook-button").click();

      cy.get("[aria-label='Custom column']").should(
        "have.css",
        "background-color",
        questionTheme.editor.secondaryActionButton.backgroundColor,
      );
    });
  });
});
