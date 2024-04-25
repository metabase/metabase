import userEvent from "@testing-library/user-event";
import type { MockCall } from "fetch-mock";
import fetchMock from "fetch-mock";

import {
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import {
  TEST_CARD,
  TEST_CARD_VISUALIZATION,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_NATIVE_CARD_DATASET,
  TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
  TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  setup,
  waitForFaviconReady,
} from "./test-utils";

registerVisualizations();

describe("QueryBuilder", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("rendering", () => {
    describe("renders structured queries", () => {
      it("renders a structured question in the simple mode", async () => {
        await setup({ card: TEST_CARD });

        expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
      });

      it("renders a structured question in the notebook mode", async () => {
        await setup({
          card: TEST_CARD,
          initialRoute: `/question/${TEST_CARD.id}/notebook`,
        });

        expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
      });

      it("renders time series grouping widget for date field breakout", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
        });
        const timeSeriesModeFooter = await screen.findByTestId(
          "timeseries-chrome",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByText("by"),
        ).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).getByTestId("timeseries-bucket-button"),
        ).toBeInTheDocument();
      });

      it("doesn't render time series grouping widget for custom date field breakout (metabase#33504)", async () => {
        await setup({
          card: TEST_TIME_SERIES_WITH_CUSTOM_DATE_BREAKOUT_CARD,
        });

        const timeSeriesModeFooter = await screen.findByTestId(
          "timeseries-chrome",
        );
        expect(timeSeriesModeFooter).toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByText("by"),
        ).not.toBeInTheDocument();
        expect(
          within(timeSeriesModeFooter).queryByTestId(
            "timeseries-bucket-button",
          ),
        ).not.toBeInTheDocument();
      });
    });

    describe("renders the row count regardless of visualization type", () => {
      const dataset = TEST_MODEL_DATASET;
      const cards = [
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "table" }),
        createMockCard({ ...TEST_CARD_VISUALIZATION, display: "line" }),
      ];

      it.each(cards)(
        `renders the row count in "$display" visualization`,
        async card => {
          await setup({
            card,
            dataset,
          });

          await waitFor(() => {
            const element = screen.getByTestId("question-row-count");
            expect(element).toBeInTheDocument();
          });

          const element = screen.getByTestId("question-row-count");
          expect(element).toBeVisible();
        },
      );
    });

    describe("query execution time", () => {
      it("renders query execution time for mbql questions", async () => {
        await setup({
          card: TEST_CARD,
          dataset: createMockDataset({
            running_time: 123,
          }),
        });

        const [runButton] = screen.getAllByTestId("run-button");
        userEvent.click(runButton);
        await waitForLoaderToBeRemoved();

        const executionTime = await screen.findByTestId("execution-time");
        expect(executionTime).toBeInTheDocument();
        expect(executionTime).toHaveTextContent("123 ms");
      });

      it("renders query execution time for native questions", async () => {
        await setup({
          card: TEST_NATIVE_CARD,
          dataset: createMockDataset({
            running_time: 123,
          }),
        });

        const executionTime = await screen.findByTestId("execution-time");
        expect(executionTime).toBeInTheDocument();
        expect(executionTime).toHaveTextContent("123 ms");
      });
    });
  });

  describe("downloading results", () => {
    // I initially planned to test unsaved native (ad-hoc) queries here as well.
    // But native queries won't run the query on first load, we need to manually
    // click the run button, but our mock `NativeQueryEditor` doesn't have a run
    // button wired up, and it's quite hard to do so (I've tried).
    // So I test that case in Cypress in `28834-modified-native-question.cy.spec.js` instead.

    it("should allow downloading results for a native query", async () => {
      const mockDownloadEndpoint = fetchMock.post(
        `path:/api/card/${TEST_NATIVE_CARD.id}/query/csv`,
        {},
      );
      const { container } = await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });

      await waitForFaviconReady(container);

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      expect(inputArea).toHaveValue("SELECT 1");

      await userEvent.click(screen.getByTestId("download-button"));
      await userEvent.click(
        await screen.findByRole("button", { name: ".csv" }),
      );

      expect(mockDownloadEndpoint.called()).toBe(true);
    });

    it("should allow downloading results for a native query using the current result even the query has changed but not rerun (metabase#28834)", async () => {
      const mockDownloadEndpoint = fetchMock.post("path:/api/dataset/csv", {});
      const { container } = await setup({
        card: TEST_NATIVE_CARD,
        dataset: TEST_NATIVE_CARD_DATASET,
      });

      await waitForFaviconReady(container);

      const inputArea = within(
        screen.getByTestId("mock-native-query-editor"),
      ).getByRole("textbox");

      await userEvent.click(inputArea);
      await userEvent.type(inputArea, " union SELECT 2");

      await userEvent.tab();

      expect(inputArea).toHaveValue("SELECT 1 union SELECT 2");

      await userEvent.click(screen.getByTestId("download-button"));
      await userEvent.click(
        await screen.findByRole("button", { name: ".csv" }),
      );

      const [url, options] = mockDownloadEndpoint.lastCall() as MockCall;
      const body = await Promise.resolve(options?.body);
      const urlSearchParams = new URLSearchParams(body as string);
      expect(url).toEqual(expect.stringContaining("/api/dataset/csv"));
      const query =
        urlSearchParams instanceof URLSearchParams
          ? JSON.parse(urlSearchParams.get("query") ?? "{}")
          : {};
      expect(query?.native.query).toEqual("SELECT 1");
    });
  });
});
