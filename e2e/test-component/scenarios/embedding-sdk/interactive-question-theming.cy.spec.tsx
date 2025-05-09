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

describe("scenarios > embedding-sdk > interactive-question > theming", () => {
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
    const BACKGROUND_COLOR = "rgb(22, 26, 29)";

    setupInteractiveQuestionWithTheme({
      colors: {
        background: BACKGROUND_COLOR,
        "background-hover": "rgb(14, 17, 20)",
        "background-disabled": "rgb(45, 45, 48)",
        "text-primary": "rgb(255, 255, 255)",
        brand: "rgb(253, 121, 168)",
      },
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      const buttonHoverBg = lighten(BACKGROUND_COLOR, 0.5);

      const customColumn = "[aria-label='Custom column']";

      // Should be the lightened version of the background color
      cy.findByTestId("notebook-button")
        .should("be.visible")
        .realHover()
        .should(($el) => assertBackgroundColorEqual($el, buttonHoverBg));

      // Should be the lightened version of the background color
      cy.findByTestId("chart-type-selector-button")
        .should("be.visible")
        .realHover()
        .should(($el) => assertBackgroundColorEqual($el, buttonHoverBg));

      cy.findByTestId("notebook-button").click();

      // Should be the lightened version of the background color, same as the notebook button hover.
      cy.get(customColumn).should(($el) =>
        assertBackgroundColorEqual($el, buttonHoverBg),
      );

      // Hover should be a less lightened version of the background color.
      cy.get(customColumn)
        .should("be.visible")
        .realHover()
        .should(($el) =>
          assertBackgroundColorEqual($el, lighten(BACKGROUND_COLOR, 0.4)),
        );
    });
  });

  it("derives dynamic css variables for light theme", () => {
    const BACKGROUND_COLOR = "rgb(255, 255, 255)";

    setupInteractiveQuestionWithTheme({
      colors: {
        background: BACKGROUND_COLOR,
        "background-hover": "rgb(245, 245, 245)",
        "background-disabled": "rgb(230, 230, 230)",
        "text-primary": "rgb(51, 51, 51)",
        brand: "rgb(253, 121, 168)",
      },
    });

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");

      const customColumn = "[aria-label='Custom column']";

      cy.findByTestId("notebook-button").click();

      // Should be the slightly darker version of the background color, same as the notebook button hover
      cy.get(customColumn).should(($el) =>
        assertBackgroundColorEqual($el, darken(BACKGROUND_COLOR, 0.05)),
      );

      // Hover should be an even darker version of the background color
      cy.get(customColumn)
        .should("be.visible")
        .realHover()
        .should(($el) =>
          assertBackgroundColorEqual($el, darken(BACKGROUND_COLOR, 0.1)),
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
        assertBackgroundColorEqual($el, BACKGROUND_COLOR);
      });

      cy.findByTestId("table-body")
        .findAllByRole("gridcell")
        .first()
        .should(($el) => {
          assertBackgroundColorEqual($el, BACKGROUND_COLOR);
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
      getColorDifferencePercentage("rgb(255, 255, 255)", "rgb(255, 255, 255)"),
    ).to.eq(0);

    // one-off different color should have less than 0.25% difference
    expect(
      getColorDifferencePercentage("rgb(255, 255, 255)", "rgb(255, 255, 254)"),
    ).to.lte(0.25);
  });
});

export function assertBackgroundColorEqual($element: JQuery, expected: string) {
  const element = $element[0];
  const style = window.getComputedStyle(element);
  const colorDifferencePercentage = getColorDifferencePercentage(
    style.backgroundColor,
    expected,
  );

  // the dynamically lightened/darkened colors are off by one,
  // so we must compare with 0.25% tolerance.
  expect(colorDifferencePercentage).to.be.lte(0.25);
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
