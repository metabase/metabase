import { renderWithProviders, screen } from "__support__/ui";
import { virtualCardDisplayTypes } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import { EmptyVizState, type EmptyVizStateProps } from "./EmptyVizState";
import type { ExcludedEmptyVizDisplayTypes } from "./utils";

const setup = (opts: EmptyVizStateProps = {}) => {
  renderWithProviders(<EmptyVizState {...opts} />, {
    storeInitialState: createMockState({}),
  });
};

describe("EmptyVizState", () => {
  it("should not render without a chart type", () => {
    setup();

    expect(
      screen.queryByTestId("visualization-placeholder"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each(virtualCardDisplayTypes)(
    "should not render for virtual card: %s",
    (chartType) => {
      setup({ chartType });

      expect(
        screen.queryByTestId("visualization-placeholder"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );

  it.each<ExcludedEmptyVizDisplayTypes>(["table", "object"])(
    "should not render for unsupported chart: %s",
    (chartType) => {
      setup({ chartType });

      expect(
        screen.queryByTestId("visualization-placeholder"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );
});
