import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCardQueryDownloadEndpoint,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { QuestionDownloadPopover } from "./QuestionDownloadPopover";

registerVisualizations();

const TEST_CARD = createMockCard({
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  ),
});

const TEST_RESULT = createMockDataset();

const FORMAT_PREFERENCE_PATH =
  "path:/api/user-key-value/namespace/last_download_format/key/download_format_preference";

interface SetupOpts {
  card?: Card;
  result?: Dataset;
  setupFormatPreference?: boolean;
}

const setup = ({
  card = TEST_CARD,
  result = TEST_RESULT,
  setupFormatPreference = true,
}: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
    }),
    settings: mockSettings({ "enable-pivoted-exports": true }),
  });

  const metadata = createMockMetadataFromState(state);
  const question = new Question(card, metadata);

  setupCardQueryDownloadEndpoint(card, "json");

  if (setupFormatPreference) {
    setupLastDownloadFormatEndpoints();
  }

  return renderWithProviders(
    <QuestionDownloadPopover question={question} result={result} />,
    { storeInitialState: state },
  );
};

const getDownloadRequestBody = async (path: string) => {
  const call = fetchMock.callHistory.lastCall(path);
  const body = await Promise.resolve(call?.options?.body);
  return new URLSearchParams(String(body));
};

describe("QuestionDownloadPopover", () => {
  it("should display query export options", async () => {
    setup();

    await userEvent.click(getIcon("download"));

    expect(
      await screen.findByRole("heading", { name: /download/i }),
    ).toBeInTheDocument();
  });

  it("shows a 'Download results' tooltip on hover", async () => {
    setup();

    await userEvent.hover(
      screen.getByRole("button", { name: "Download results" }),
    );

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Download results",
    );
  });

  describe.each(["csv", "xlsx"])("saved question %s export", (format) => {
    const card = createMockCard({
      ...TEST_CARD,
      id: 42,
      display: "table",
    });
    const downloadPath = `path:/api/card/${card.id}/query/${format}`;

    beforeEach(() => {
      fetchMock.post(downloadPath, {});
    });

    it.each([
      { enableFormatting: true, expected: "true" },
      { enableFormatting: false, expected: "false" },
    ])(
      "sends format_rows=$expected when 'Keep the data formatted' is $enableFormatting",
      async ({ enableFormatting, expected }) => {
        setup({ card });

        await userEvent.click(
          screen.getByRole("button", { name: "Download results" }),
        );
        await userEvent.click(await screen.findByLabelText(`.${format}`));
        if (!enableFormatting) {
          await userEvent.click(
            screen.getByLabelText("Keep the data formatted"),
          );
        }
        await userEvent.click(screen.getByTestId("download-results-button"));

        await waitFor(() =>
          expect(fetchMock.callHistory.calls(downloadPath)).toHaveLength(1),
        );
        const body = await getDownloadRequestBody(downloadPath);
        expect(body.get("format_rows")).toBe(expected);
        expect(body.get("pivot_results")).toBe("false");
      },
    );
  });

  describe("pivot table csv export", () => {
    const card = createMockCard({
      ...TEST_CARD,
      id: 43,
      name: "Pivot Table",
      display: "pivot",
    });
    const downloadPath = `path:/api/card/${card.id}/query/csv`;

    beforeEach(() => {
      fetchMock.post(downloadPath, {});
    });

    it("sends pivot_results=true by default", async () => {
      setup({ card });

      await userEvent.click(
        screen.getByRole("button", { name: "Download results" }),
      );
      await userEvent.click(await screen.findByLabelText(".csv"));
      expect(screen.getByLabelText("Keep the data pivoted")).toBeChecked();
      await userEvent.click(screen.getByTestId("download-results-button"));

      await waitFor(() =>
        expect(fetchMock.callHistory.calls(downloadPath)).toHaveLength(1),
      );
      const body = await getDownloadRequestBody(downloadPath);
      expect(body.get("pivot_results")).toBe("true");
      expect(body.get("format_rows")).toBe("true");
    });

    it("sends pivot_results=false when 'Keep the data pivoted' is unchecked", async () => {
      setup({ card });

      await userEvent.click(
        screen.getByRole("button", { name: "Download results" }),
      );
      await userEvent.click(await screen.findByLabelText(".csv"));
      await userEvent.click(screen.getByLabelText("Keep the data pivoted"));
      await userEvent.click(screen.getByTestId("download-results-button"));

      await waitFor(() =>
        expect(fetchMock.callHistory.calls(downloadPath)).toHaveLength(1),
      );
      const body = await getDownloadRequestBody(downloadPath);
      expect(body.get("pivot_results")).toBe("false");
      expect(body.get("format_rows")).toBe("true");
    });
  });

  describe("unsaved pivot table csv export", () => {
    const card = createMockCard({
      ...TEST_CARD,
      id: undefined,
      name: "Pivot Table",
      display: "pivot",
    });
    // The API sends the row-limit constraints back in json_query, but its type
    // does not declare them; the export must drop them.
    const jsonQueryWithConstraints = {
      ...TEST_CARD.dataset_query,
      constraints: { "max-results": 10000, "max-results-bare-rows": 2000 },
    };
    const result = createMockDataset({ json_query: jsonQueryWithConstraints });
    const downloadPath = "path:/api/dataset/csv";

    beforeEach(() => {
      fetchMock.post(downloadPath, {});
    });

    it.each([
      { keepPivoted: true, expected: "true" },
      { keepPivoted: false, expected: "false" },
    ])(
      "sends the query, display and pivot_results=$expected to the dataset endpoint",
      async ({ keepPivoted, expected }) => {
        setup({ card, result });

        await userEvent.click(
          screen.getByRole("button", { name: "Download results" }),
        );
        await userEvent.click(await screen.findByLabelText(".csv"));
        if (!keepPivoted) {
          await userEvent.click(screen.getByLabelText("Keep the data pivoted"));
        }
        await userEvent.click(screen.getByTestId("download-results-button"));

        await waitFor(() =>
          expect(fetchMock.callHistory.calls(downloadPath)).toHaveLength(1),
        );
        const body = await getDownloadRequestBody(downloadPath);
        expect(body.get("pivot_results")).toBe(expected);
        expect(body.get("format_rows")).toBe("true");
        expect(body.get("display")).toBe(JSON.stringify("pivot"));
        const query: unknown = JSON.parse(body.get("query") ?? "null");
        expect(query).toEqual(TEST_CARD.dataset_query);
      },
    );
  });

  describe("download format preference (metabase#16108)", () => {
    const setupStoredFormatPreference = ({
      putDelayMs,
    }: {
      putDelayMs: number;
    }) => {
      let storedValue: unknown = {
        last_download_format: "csv",
        last_table_download_format: "csv",
      };
      fetchMock.get(FORMAT_PREFERENCE_PATH, () => ({
        status: 200,
        body: storedValue,
      }));
      fetchMock.put(
        FORMAT_PREFERENCE_PATH,
        ({ options }) => {
          const body: unknown = JSON.parse(String(options.body));
          if (typeof body === "object" && body != null && "value" in body) {
            storedValue = body.value;
          }
          return { status: 200 };
        },
        { delay: putDelayMs },
      );
    };

    it.each([
      { display: "table", hasPng: false, putDelayMs: 0 },
      { display: "line", hasPng: true, putDelayMs: 0 },
      { display: "table", hasPng: false, putDelayMs: 700 },
    ] as const)(
      "remembers the downloaded format after a reload ($display, PUT delay $putDelayMs ms)",
      async ({ display, hasPng, putDelayMs }) => {
        const card = createMockCard({ ...TEST_CARD, id: 44, display });
        const downloadPath = `path:/api/card/${card.id}/query/xlsx`;
        fetchMock.post(downloadPath, {});
        setupStoredFormatPreference({ putDelayMs });

        const { unmount } = setup({ card, setupFormatPreference: false });

        await userEvent.click(
          screen.getByRole("button", { name: "Download results" }),
        );
        expect(
          await screen.findByRole("radio", { name: ".csv" }),
        ).toBeChecked();
        await userEvent.click(screen.getByLabelText(".xlsx"));
        await userEvent.click(screen.getByTestId("download-results-button"));

        await waitFor(() =>
          expect(
            fetchMock.callHistory.calls(FORMAT_PREFERENCE_PATH, {
              method: "PUT",
            }),
          ).toHaveLength(1),
        );
        const putCall = fetchMock.callHistory.lastCall(FORMAT_PREFERENCE_PATH, {
          method: "PUT",
        });
        const putBody: unknown = JSON.parse(String(putCall?.options?.body));
        expect(putBody).toEqual({
          value: {
            last_download_format: "xlsx",
            last_table_download_format: "xlsx",
          },
        });
        await waitFor(() =>
          expect(fetchMock.callHistory.calls(downloadPath)).toHaveLength(1),
        );
        // A reload only sees the preference once the write has finished
        await fetchMock.callHistory.flush(true);

        unmount();
        setup({ card, setupFormatPreference: false });

        await userEvent.click(
          screen.getByRole("button", { name: "Download results" }),
        );
        await waitFor(() =>
          expect(screen.getByRole("radio", { name: ".xlsx" })).toBeChecked(),
        );
        expect(screen.queryAllByText(".png")).toHaveLength(hasPng ? 1 : 0);
      },
    );
  });
});
