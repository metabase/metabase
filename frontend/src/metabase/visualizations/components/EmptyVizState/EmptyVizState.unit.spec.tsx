import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { virtualCardDisplayTypes } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import { EmptyVizState, type EmptyVizStateProps } from "./EmptyVizState";
import { type ExcludedEmptyVizDisplayTypes, getEmptyVizConfig } from "./utils";

const docsCTAChartTypes = ["funnel", "map", "sankey"] as const;
const CTAChartTypes = [
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
  "smartscalar",
  "gauge",
  "progress",
  "scatter",
  "waterfall",
] as const;

const setup = (opts: Partial<EmptyVizStateProps> = {}) => {
  renderWithProviders(<EmptyVizState isNativeView={false} {...opts} />, {
    storeInitialState: createMockState({}),
  });
};

describe("EmptyVizState", () => {
  it("should not render without a chart type", () => {
    setup();
    assertEmptyStateDidNotRender();
  });

  it.each(virtualCardDisplayTypes)(
    "should not render for virtual card: %s",
    (chartType) => {
      setup({ chartType });
      assertEmptyStateDidNotRender();
    },
  );

  it.each<ExcludedEmptyVizDisplayTypes>(["table", "object"])(
    "should not render for unsupported chart: %s",
    (chartType) => {
      setup({ chartType });
      assertEmptyStateDidNotRender();
    },
  );

  it.each(docsCTAChartTypes)(
    "should render the documentation CTA for %s visualization",
    (chartType) => {
      const onEditSummary = jest.fn();
      setup({ chartType, onEditSummary });

      const { primaryText, secondaryText, docsLink } =
        getEmptyVizConfig(chartType);

      const formattedURL = `https://www.metabase.com/docs/latest/${docsLink}.html?utm_source=product&utm_medium=docs&utm_campaign=empty-states&utm_content=empty-states-viz&source_plan=oss`;

      expect(
        screen.getByAltText(`${chartType} chart example illustration`),
      ).toBeInTheDocument();
      expect(screen.getByText(primaryText)).toBeInTheDocument();
      expect(screen.getByText(secondaryText)).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveProperty("href", formattedURL);
      expect(
        screen.queryByLabelText("Open summarize sidebar"),
      ).not.toBeInTheDocument();
    },
  );

  describe("QB empty viz state", () => {
    it.each(CTAChartTypes)(
      "should prompt to open the summarize sidebar for %s visualization",
      (chartType) => {
        const onEditSummary = jest.fn();
        setup({ chartType, onEditSummary });

        const { secondaryText } = getEmptyVizConfig(chartType);

        expect(
          screen.getByAltText(`${chartType} chart example illustration`),
        ).toBeInTheDocument();
        expect(screen.getByText(/^click on/i)).toBeInTheDocument();
        // Not matching on `primaryText` because it sometimes contains parentheses.
        // We'd have to escape the special chars in the regex, which seems like an overkill for this test.
        expect(screen.getByText(/then pick/i)).toBeInTheDocument();
        expect(screen.getByText(secondaryText)).toBeInTheDocument();
        expect(
          screen.getByLabelText("Open summarize sidebar"),
        ).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
      },
    );

    it("should call `onEditSummary` when clicking the Summarize button", async () => {
      const onEditSummary = jest.fn();
      setup({
        chartType: "line",
        onEditSummary,
        isSummarizeSidebarOpen: false,
      });

      await userEvent.click(screen.getByLabelText("Open summarize sidebar"));
      expect(onEditSummary).toHaveBeenCalledTimes(1);
    });

    it("should not render the summarize CTA button if the sidebar is already open", async () => {
      const onEditSummary = jest.fn();
      setup({ chartType: "line", onEditSummary, isSummarizeSidebarOpen: true });

      expect(
        screen.queryByLabelText("Open summarize sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Summarize"));
      expect(onEditSummary).not.toHaveBeenCalled();
    });

    it("should not render the summarize CTA button if onEditSummary is undefined", async () => {
      setup({ chartType: "line", onEditSummary: undefined });

      expect(
        screen.queryByLabelText("Open summarize sidebar"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Native empty viz state", () => {
    it.each(CTAChartTypes)(
      "should render the native empty state for %s visualization",
      (chartType) => {
        setup({ chartType, isNativeView: true });

        const { secondaryText } = getEmptyVizConfig(chartType);

        expect(
          screen.getByAltText(`${chartType} chart example illustration`),
        ).toBeInTheDocument();
        expect(screen.getByText(/^click on/i)).toBeInTheDocument();
        expect(
          screen.getByText(
            /in the bottom left corner. Then pick one or more metrics for your axes.$/i,
          ),
        ).toBeInTheDocument();
        expect(screen.queryByText(secondaryText)).not.toBeInTheDocument();
      },
    );
  });
});

const assertEmptyStateDidNotRender = () => {
  expect(
    screen.queryByTestId("visualization-placeholder"),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
};
