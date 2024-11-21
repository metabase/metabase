import userEvent from "@testing-library/user-event";

import { setupCardQueryDownloadEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QueryDownloadPopover } from "./QueryDownloadPopover";

registerVisualizations();

const TEST_CARD = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_RESULT = createMockDataset();

interface SetupOpts {
  card?: Card;
  result?: Dataset;
  settings?: Record<string, unknown>;
}

const setup = ({
  card = TEST_CARD,
  result = TEST_RESULT,
  settings = { "enable-pivoted-exports": true },
}: SetupOpts = {}) => {
  const onDownload = jest.fn();

  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
    }),
    settings: mockSettings(settings),
  });

  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));

  setupCardQueryDownloadEndpoint(card, "json");

  renderWithProviders(
    <QueryDownloadPopover
      question={question}
      result={result}
      onDownload={onDownload}
    />,
    {
      storeInitialState: state,
    },
  );

  return { onDownload };
};

describe("QueryDownloadPopover", () => {
  it("should display download options", async () => {
    setup();

    expect(screen.getByText(/csv/)).toBeInTheDocument();
    expect(screen.getByText(/xlsx/)).toBeInTheDocument();
    expect(screen.getByText(/json/)).toBeInTheDocument();
  });

  it("should suggest PNG downloads for compatible visualizations", async () => {
    setup({ card: { ...TEST_CARD, display: "line" } });
    expect(screen.getByText(/png/)).toBeInTheDocument();
  });

  it("should not suggest PNG downloads for incompatible visualizations", async () => {
    setup({ card: { ...TEST_CARD, display: "table" } });
    expect(screen.queryByText(/png/)).not.toBeInTheDocument();
  });

  it("should trigger download on click", async () => {
    const { onDownload } = setup();
    await act(async () => await userEvent.click(screen.getByText(/csv/)));
    await userEvent.click(await screen.findByTestId("download-results-button"));
    expect(onDownload).toHaveBeenCalledWith({
      type: "csv",
      enableFormatting: true,
      enablePivot: false,
    });
  });

  it.each(["csv", "json", "xlsx"])(
    "should trigger unformatted download for %s format",
    async format => {
      const { onDownload } = setup();

      await userEvent.click(screen.getByLabelText(`.${format}`));
      await userEvent.click(screen.getByLabelText("Unformatted"));
      expect(screen.queryByTestId("formatting-description")).toHaveTextContent(
        `E.g. 2024-09-06 or 187.50, like in the database`,
      );
      expect(
        screen.queryByLabelText("Keep data pivoted"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        await screen.findByTestId("download-results-button"),
      );

      expect(onDownload).toHaveBeenCalledWith({
        type: format,
        enableFormatting: false,
        enablePivot: false,
      });
    },
  );

  it.each(["csv", "json", "xlsx"])(
    "should trigger formatted download for %s format",
    async format => {
      const { onDownload } = setup();

      await userEvent.click(screen.getByLabelText(`.${format}`));
      await userEvent.click(screen.getByLabelText("Formatted"));
      expect(screen.queryByTestId("formatting-description")).toHaveTextContent(
        `E.g. September 6, 2024 or $187.50, like in Metabase`,
      );
      expect(
        screen.queryByLabelText("Keep data pivoted"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        await screen.findByTestId("download-results-button"),
      );

      expect(onDownload).toHaveBeenCalledWith({
        type: format,
        enableFormatting: true,
        enablePivot: false,
      });
    },
  );

  it("should not trigger unformatted download for png format", async () => {
    const format = "png";
    const { onDownload } = setup({ card: { ...TEST_CARD, display: "line" } });

    await userEvent.click(screen.getByLabelText(`.${format}`));
    expect(screen.queryByLabelText(`Formatted`)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Keep data pivoted"),
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("download-results-button"));

    expect(onDownload).toHaveBeenCalledWith({
      type: format,
      enableFormatting: true,
      enablePivot: false,
    });
  });

  it.each(["csv", "xlsx"])(
    "allows configure pivoting for %s format",
    async format => {
      const { onDownload } = setup({
        card: {
          ...TEST_CARD,
          display: "pivot",
        },
      });

      await userEvent.click(screen.getByLabelText(`.${format}`));
      await userEvent.click(screen.getByLabelText(`Unformatted`));
      await userEvent.click(
        await screen.findByTestId("download-results-button"),
      );

      expect(onDownload).toHaveBeenCalledWith({
        type: format,
        enableFormatting: false,
        enablePivot: true,
      });
    },
  );

  it("should hide 'Keep data pivoted' option when enable-pivoted-exports setting is false", async () => {
    setup({
      card: { ...TEST_CARD, display: "pivot" },
      settings: { "enable-pivoted-exports": false },
    });

    await userEvent.click(screen.getByLabelText(".csv"));
    expect(
      screen.queryByLabelText("Keep data pivoted"),
    ).not.toBeInTheDocument();
  });
});
