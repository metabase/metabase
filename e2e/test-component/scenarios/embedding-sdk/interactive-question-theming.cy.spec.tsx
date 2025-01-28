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

  it("derives dynamic css variables for dark theme", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "rgb(22, 26, 29)",
        "background-hover": "rgb(14, 17, 20)",
        "background-disabled": "rgb(45, 45, 48)",
        "text-primary": "rgb(255, 255, 255)",
        brand: "rgb(253, 121, 168)",
      },
    };

    cy.get<number>("@questionId").then(questionId => {
      mountSdkContent(
        <Box bg={theme.colors?.background} h="100vh">
          <InteractiveQuestion questionId={questionId} />
        </Box>,
        { theme },
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      const buttonHoverBg = "rgb(33, 39, 43)";
      const customColumn = "[aria-label='Custom column']";

      // Should be the lightened version of the background color.
      cy.findByTestId("notebook-button")
        .realHover()
        .should("have.css", "background-color", buttonHoverBg);

      // Should be the lightened version of the background color.
      cy.findByTestId("chart-type-selector-button")
        .realHover()
        .should("have.css", "background-color", buttonHoverBg);

      cy.findByTestId("notebook-button").click();

      // Should be the lightened version of the background color, same as the notebook button hover.
      cy.get(customColumn).should(
        "have.css",
        "background-color",
        buttonHoverBg,
      );

      // Hover should be a less lightened version of the background color.
      cy.get(customColumn)
        .realHover()
        .should("have.css", "background-color", "rgb(31, 36, 41)");
    });
  });

  it("derives dynamic css variables for light theme", () => {
    const theme: MetabaseTheme = {
      colors: {
        background: "rgb(255, 255, 255)",
        "background-hover": "rgb(245, 245, 245)",
        "background-disabled": "rgb(230, 230, 230)",
        "text-primary": "rgb(51, 51, 51)",
        brand: "rgb(253, 121, 168)",
      },
    };

    cy.get<number>("@questionId").then(questionId => {
      mountSdkContent(
        <Box bg={theme.colors?.background} h="100vh">
          <InteractiveQuestion questionId={questionId} />
        </Box>,
        { theme },
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      const customColumn = "[aria-label='Custom column']";

      cy.findByTestId("notebook-button").click();

      // Should be the slightly darker version of the background color, same as the notebook button hover
      cy.get(customColumn).should(
        "have.css",
        "background-color",
        "rgb(242, 242, 242)",
      );

      // Hover should be an even slightly darker version of the background color
      cy.get(customColumn)
        .realHover()
        .should("have.css", "background-color", "rgb(230, 230, 230)");
    });
  });
});
