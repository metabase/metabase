import {
  InteractiveQuestion,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";
import Color from "color";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { Box } from "metabase/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const darken = (color: string | undefined, amount: number) =>
  Color(color).darken(amount).rgb().toString();

const lighten = (color: string | undefined, amount: number) =>
  Color(color).lighten(amount).rgb().toString();

describe(
  "scenarios > embedding-sdk > interactive-question > theming",
  // realHover color check is flaky 10% of the time so a retry is added
  { retries: { runMode: 2, openMode: 2 } },
  () => {
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

        const buttonHoverBg = lighten(theme.colors?.background, 0.5);

        const customColumn = "[aria-label='Custom column']";

        // Should be the lightened version of the background color
        cy.findByTestId("notebook-button")
          .should("be.visible")
          .realHover()
          .should($el => haveBackgroundColor($el, buttonHoverBg));

        // Should be the lightened version of the background color
        cy.findByTestId("chart-type-selector-button")
          .should("be.visible")
          .realHover()
          .should($el => haveBackgroundColor($el, buttonHoverBg));

        cy.findByTestId("notebook-button").click();

        // Should be the lightened version of the background color, same as the notebook button hover.
        cy.get(customColumn).should($el =>
          haveBackgroundColor($el, buttonHoverBg),
        );

        // Hover should be a less lightened version of the background color.
        cy.get(customColumn)
          .should("be.visible")
          .realHover()
          .should($el =>
            haveBackgroundColor($el, lighten(theme.colors?.background, 0.4)),
          );
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
        cy.get(customColumn).should($el =>
          haveBackgroundColor($el, darken(theme.colors?.background, 0.05)),
        );

        // Hover should be an even darker version of the background color
        cy.get(customColumn)
          .should("be.visible")
          .realHover()
          .should($el =>
            haveBackgroundColor($el, darken(theme.colors?.background, 0.1)),
          );
      });
    });
  },
);

/**
 * Using should("have.css", "background-color") causes off-by-one error that causes the test to fail.
 * For some reason, using getComputedStyle() directly produces the correct result.
 **/
export function haveBackgroundColor(
  $element: JQuery,
  expected: string,
): boolean {
  const element = $element[0];
  const style = window.getComputedStyle(element);

  return style.backgroundColor === expected;
}
