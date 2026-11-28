import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNativeQuerySnippetEndpoints } from "__support__/server-mocks";
import { renderHook, screen, waitFor, within } from "__support__/ui";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { defer } from "metabase/utils/promise";
import { registerVisualizations } from "metabase/visualizations/register";

import {
  TEST_NATIVE_CARD_DATASET,
  TEST_UNSAVED_NATIVE_CARD,
  setup,
} from "./test-utils";

// The global mock of NativeQueryEditor has no run button. This file runs the
// question with the real editor's button, as a user does.
jest.unmock("metabase/querying/components/NativeQueryEditor");

registerVisualizations();

describe("QueryBuilder > native question run", () => {
  it("shows the loading message in the page and the document title while an ad-hoc native question loads (metabase#40051)", async () => {
    renderHook(() => usePageTitle("Metabase", { titleIndex: 0 }));
    const response = defer<Response>();

    // the real editor loads snippets for autocomplete
    setupNativeQuerySnippetEndpoints();
    await setup({ card: TEST_UNSAVED_NATIVE_CARD });
    fetchMock.modifyRoute("dataset-post", {
      response: () => response.promise,
    });

    const editor = await screen.findByTestId("native-query-editor-container");
    const runButton = await within(editor).findByRole("button", {
      name: "Get Answer",
    });
    expect(within(runButton).getByLabelText("play icon")).toBeInTheDocument();
    // an ad-hoc native question does not run on load
    expect(fetchMock.callHistory.calls("dataset-post")).toHaveLength(0);

    await userEvent.click(runButton);

    const main = screen.getByTestId("query-builder-main");
    expect(
      await within(main).findByText("Doing science..."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe("Doing science... · Metabase"),
    );
    expect(
      within(editor).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("play icon")).not.toBeInTheDocument();

    const [datasetCall] = fetchMock.callHistory.calls("dataset-post");
    expect(JSON.parse(String(datasetCall.options.body))).toEqual(
      expect.objectContaining({
        stages: [
          expect.objectContaining({
            "lib/type": "mbql.stage/native",
            native: "SELECT 1",
          }),
        ],
      }),
    );

    response.resolve(
      new Response(JSON.stringify(TEST_NATIVE_CARD_DATASET), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => expect(document.title).toBe("Question · Metabase"));
    expect(
      within(main).queryByText("Doing science..."),
    ).not.toBeInTheDocument();
    expect(
      within(editor).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });
});
