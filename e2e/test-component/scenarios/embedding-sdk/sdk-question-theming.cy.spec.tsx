import {
  InteractiveQuestion,
  type MetabaseTheme,
} from "@metabase/embedding-sdk-react";
import Color from "color";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { Box } from "metabase/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "47563";

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
        name: QUESTION_NAME,
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
      const BACKGROUND_COLOR = "rgb(22, 26, 29)";

      setupInteractiveQuestionWithTheme({
        colors: {
          background: BACKGROUND_COLOR,
          "text-primary": "rgb(255, 255, 255)",
          brand: "rgb(253, 121, 168)",
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Product ID").should("be.visible");

        cy.findByTestId("interactive-question-result-toolbar").should(($el) =>
          assertBackgroundColorEqual($el, lighten(BACKGROUND_COLOR, 0.5)),
        );
      });
    });

    it("applies a theme preset and overrides it with a theme", () => {
      setupInteractiveQuestionWithTheme({
        preset: "dark",
        colors: {
          "text-primary": "red",
        },
      });

      getSdkRoot().within(() => {
        cy.findByTestId("table-root").should(
          "have.css",
          "background-color",
          "rgb(7, 23, 34)",
        );

        cy.findByText(QUESTION_NAME).should(
          "have.css",
          "color",
          "rgb(255, 0, 0)",
        );
      });
    });

    it("derives dynamic css variables for light theme", () => {
      const BACKGROUND_COLOR = "rgb(255, 255, 255)";

      setupInteractiveQuestionWithTheme({
        colors: {
          background: BACKGROUND_COLOR,
          "text-primary": "rgb(51, 51, 51)",
          brand: "rgb(253, 121, 168)",
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Product ID").should("be.visible");

        cy.findByTestId("interactive-question-result-toolbar").should(($el) =>
          assertBackgroundColorEqual($el, darken(BACKGROUND_COLOR, 0.04)),
        );
      });
    });

    it("overrides the question toolbar's default background color", () => {
      const BACKGROUND_COLOR = "rgb(100, 150, 200)";

      setupInteractiveQuestionWithTheme({
        colors: {
          background: "rgb(255, 255, 255)",
          "text-primary": "rgb(51, 51, 51)",
          brand: "rgb(253, 121, 168)",
        },
        components: {
          question: {
            toolbar: { backgroundColor: BACKGROUND_COLOR },
          },
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Product ID").should("be.visible");

        // Should use the toolbar backgroundColor override, not the default background
        cy.findByTestId("interactive-question-result-toolbar").should(($el) =>
          assertBackgroundColorEqual($el, BACKGROUND_COLOR),
        );
      });
    });

    it("table cell color should follow the background color", () => {
      const BACKGROUND_COLOR = "rgb(200, 210, 220)";

      setupInteractiveQuestionWithTheme({
        colors: { background: BACKGROUND_COLOR },
      });

      getSdkRoot().within(() => {
        cy.findByTestId("table-header").should(($el) => {
          // header has to be solid so it does not show underlying content when scrolling
          assertBackgroundColorEqual($el, BACKGROUND_COLOR);
        });

        cy.findByTestId("table-body")
          .findAllByRole("gridcell")
          .first()
          .should(($el) => {
            // cell color should be transparent
            assertBackgroundColorEqual($el, "rgba(0, 0, 0, 0)");
          });
      });
    });

    it("table.cell.backgroundColor should override table cell color", () => {
      const CELL_COLOR = "rgb(123, 111, 222)";

      setupInteractiveQuestionWithTheme({
        colors: { background: "rgb(200, 210, 220)" },
        components: {
          table: { cell: { backgroundColor: CELL_COLOR } },
        },
      });

      getSdkRoot().within(() => {
        cy.findByTestId("table-header").should(($el) => {
          assertBackgroundColorEqual($el, CELL_COLOR);
        });

        cy.findByTestId("table-body")
          .findAllByRole("gridcell")
          .first()
          .should(($el) => {
            assertBackgroundColorEqual($el, CELL_COLOR);
          });
      });
    });

    it("getColorDifferencePercentage compares colors correctly", () => {
      // same color should have 0% difference
      expect(
        getColorDifferencePercentage(
          "rgb(255, 255, 255)",
          "rgb(255, 255, 255)",
        ),
      ).to.eq(0);

      // one-off different color should have less than 0.25% difference
      expect(
        getColorDifferencePercentage(
          "rgb(255, 255, 255)",
          "rgb(255, 255, 254)",
        ),
      ).to.lte(0.25);
    });
  },
);

export function assertBackgroundColorEqual($element: JQuery, expected: string) {
  const element = $element[0];
  const style = window.getComputedStyle(element);

  const colorDifferencePercentage = getColorDifferencePercentage(
    style.backgroundColor,
    expected,
  );

  // the dynamically lightened/darkened colors are off by one,
  // so we must compare with 1% tolerance.
  expect(
    colorDifferencePercentage,
    "color difference percentage is higher than expected",
  ).to.be.lte(1);
}

function getColorDifferencePercentage(color1: string, color2: string) {
  const c1 = Color(color1);
  const c2 = Color(color2);

  const rgbDiff = Math.sqrt(
    Math.pow(c1.red() - c2.red(), 2) +
      Math.pow(c1.green() - c2.green(), 2) +
      Math.pow(c1.blue() - c2.blue(), 2),
  );

  return (rgbDiff / 441.7) * 100;
}

function setupInteractiveQuestionWithTheme(theme: MetabaseTheme) {
  cy.get<number>("@questionId").then((questionId) => {
    mountSdkContent(
      <Box bg={theme.colors?.background} h="100vh">
        <InteractiveQuestion questionId={questionId} />
      </Box>,
      { sdkProviderProps: { theme } },
    );
  });
}
