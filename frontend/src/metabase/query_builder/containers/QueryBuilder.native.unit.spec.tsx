import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  act,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { setNativeEditorSelectedRange } from "../actions";
import { getQuestion } from "../store/selectors";

import {
  TEST_DB,
  TEST_NATIVE_CARD,
  setup,
  triggerNativeQueryChange,
  waitForNativeQueryEditorReady,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

const getQueryRunCount = () =>
  fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" }).length +
  fetchMock.callHistory.calls(`path:/api/card/${TEST_NATIVE_CARD.id}/query`, {
    method: "POST",
  }).length;

const submitSaveModal = async ({ name }: { name?: string } = {}) => {
  await waitForSaveToBeEnabled();
  await userEvent.click(screen.getByText("Save"));
  const modal = await screen.findByTestId("save-question-modal");
  if (name) {
    await userEvent.type(within(modal).getByLabelText("Name"), name);
  }
  await userEvent.click(within(modal).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByTestId("save-question-modal")).not.toBeInTheDocument(),
  );
};

describe("QueryBuilder > native questions", () => {
  it("runs only the selected text and keeps the full query (metabase#16886)", async () => {
    const card = {
      ...TEST_NATIVE_CARD,
      dataset_query: createMockNativeDatasetQuery({
        database: SAMPLE_DB_ID,
        native: createMockNativeQuery({ query: "select 1 from orders" }),
      }),
    };
    setupListNotificationEndpoints({ card_id: card.id }, []);
    const { store } = await setup({ card });
    await waitFor(() => expect(getQueryRunCount()).toBe(1));

    act(() => {
      store.dispatch(
        setNativeEditorSelectedRange([
          { start: { row: 0, column: 0 }, end: { row: 0, column: 8 } },
        ]),
      );
    });
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    const runCall = await waitFor(() =>
      checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      ),
    );
    const runBody: unknown = JSON.parse(String(runCall.options.body));
    expect(runBody).toMatchObject({ stages: [{ native: "select 1" }] });
    expect(
      Lib.rawNativeQuery(checkNotNull(getQuestion(store.getState())).query()),
    ).toBe("select 1 from orders");
  });

  it("does not run a new native question when it is saved (metabase#30165)", async () => {
    setupCardCreateEndpoint();
    setupCardQueryMetadataEndpoint(
      createMockCard(),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    await setup({ card: null, initialRoute: "/" });

    await userEvent.click(screen.getByText("New"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText("SQL query"),
    );
    await waitForLoaderToBeRemoved();
    await triggerNativeQueryChange();

    await submitSaveModal({ name: "Q1" });

    expect(
      fetchMock.callHistory.calls("path:/api/card", { method: "POST" }),
    ).toHaveLength(1);
    expect(
      screen.getByText("Here's where your results will appear"),
    ).toBeInTheDocument();
    expect(getQueryRunCount()).toBe(0);
  });

  it("saves the template tags of a new native question as its parameters", async () => {
    setupCardCreateEndpoint();
    setupCardQueryMetadataEndpoint(
      createMockCard(),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    await setup({ card: null, initialRoute: "/" });
    await userEvent.click(screen.getByText("New"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText("SQL query"),
    );
    await waitForLoaderToBeRemoved();
    await waitForNativeQueryEditorReady();

    await userEvent.click(
      within(screen.getByTestId("mock-native-query-editor")).getByRole(
        "textbox",
      ),
    );
    await userEvent.paste("select * from products where category = {{cat}}");
    await userEvent.tab();
    await submitSaveModal({ name: "SQL Products" });

    const saveCall = checkNotNull(
      fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" }),
    );
    const saveBody: unknown = JSON.parse(String(saveCall.options.body));
    expect(saveBody).toMatchObject({
      parameters: [
        {
          slug: "cat",
          target: ["variable", ["template-tag", "cat"]],
        },
      ],
    });
  });

  it("saves a native question whose results have no rows as a new question", async () => {
    setupListNotificationEndpoints({ card_id: TEST_NATIVE_CARD.id }, []);
    const { router } = await setup({ card: TEST_NATIVE_CARD });
    expect(await screen.findByText("No results")).toBeInTheDocument();

    await triggerNativeQueryChange();
    await waitForSaveToBeEnabled();
    await userEvent.click(screen.getByText("Save"));
    const modal = await screen.findByTestId("save-question-modal");
    await userEvent.click(within(modal).getByText("Save as new question"));
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/card", { method: "POST" }),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(router.location.pathname).toMatch(/^\/question\/1-/),
    );
  });

  it("does not rerun a saved native question when its query changes are saved (metabase#30165)", async () => {
    setupListNotificationEndpoints({ card_id: TEST_NATIVE_CARD.id }, []);
    await setup({ card: TEST_NATIVE_CARD });
    await waitFor(() => expect(getQueryRunCount()).toBe(1));

    await triggerNativeQueryChange();
    await submitSaveModal();

    expect(
      fetchMock.callHistory.calls(`path:/api/card/${TEST_NATIVE_CARD.id}`, {
        method: "PUT",
      }),
    ).toHaveLength(1);
    expect(getQueryRunCount()).toBe(1);
  });
});
