import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Formik } from "formik";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { JevSaveCheck } from "metabase/api/jev-saving";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SaveQuestionContext } from "../context";
import type { FormValues } from "../types";

import { JevCollectionSuggestion, JevDuplicateCallout } from "./JevSaveHints";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

const CHECK_URL = "path:/api/jev/saving/check";

const OK_RESPONSE: JevSaveCheck = {
  status: "ok",
  duplicate: {
    card_id: 15,
    name: "Revenue per quarter",
    type: "question",
    display: "line",
    collection_id: 11,
    collection_name: "Sales",
    confidence: 0.82,
  },
  collection: { id: 11, name: "Sales", confidence: 0.97 },
  elapsed_ms: 212.4,
};

function getQuestion() {
  return new Question(
    {
      display: "table",
      visualization_settings: {},
      type: "question",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      },
    },
    metadata,
  );
}

const INITIAL_VALUES: FormValues = {
  saveType: "create",
  collection_id: 6,
  dashboard_id: undefined,
  dashboard_tab_id: undefined,
  name: "",
  description: "",
};

function setup(response: JevSaveCheck | number = OK_RESPONSE) {
  fetchMock.post(
    CHECK_URL,
    typeof response === "number" ? { status: response } : response,
  );
  const question = getQuestion();
  const onSubmit = jest.fn();
  let latestValues: FormValues = INITIAL_VALUES;

  renderWithProviders(
    <Formik initialValues={INITIAL_VALUES} onSubmit={onSubmit}>
      {({ values, setValues }) => {
        latestValues = values;
        return (
          <SaveQuestionContext.Provider
            value={{
              question,
              originalQuestion: null,
              initialValues: INITIAL_VALUES,
              handleSubmit: async () => undefined,
              values,
              setValues,
              showSaveType: false,
              multiStep: false,
            }}
          >
            <JevDuplicateCallout />
            <JevCollectionSuggestion />
          </SaveQuestionContext.Provider>
        );
      }}
    </Formik>,
  );

  return { getValues: () => latestValues };
}

describe("JevSaveHints", () => {
  it("sends the question's query once and renders the duplicate callout", async () => {
    setup();

    expect(
      await screen.findByTestId("jev-duplicate-callout"),
    ).toBeInTheDocument();
    expect(screen.getByText(/already answers this/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Revenue per quarter" }),
    ).toHaveAttribute("href", "/question/15");
    expect(screen.getByText("82% match · in Sales")).toBeInTheDocument();
    expect(screen.getByText("Jev · 212ms")).toBeInTheDocument();

    const calls = fetchMock.callHistory.calls(CHECK_URL);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].options.body));
    expect(body.dataset_query.database).toBe(SAMPLE_DB_ID);
    expect(body.type).toBe("question");
  });

  it("sets the form's collection when the suggestion chip is clicked, then hides it", async () => {
    const { getValues } = setup();

    const chip = await screen.findByRole("button", {
      name: /Save to Sales instead\?/,
    });
    await userEvent.click(chip);

    await waitFor(() => expect(getValues().collection_id).toBe(11));
    expect(
      screen.queryByTestId("jev-collection-suggestion"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when Jev is unavailable", async () => {
    setup({ ...OK_RESPONSE, status: "unavailable" });

    await waitFor(() =>
      expect(fetchMock.callHistory.calls(CHECK_URL)).toHaveLength(1),
    );
    expect(
      screen.queryByTestId("jev-duplicate-callout"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("jev-collection-suggestion"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the check fails", async () => {
    setup(500);

    await waitFor(() =>
      expect(fetchMock.callHistory.calls(CHECK_URL)).toHaveLength(1),
    );
    expect(screen.queryByText(/Jev ·/)).not.toBeInTheDocument();
  });
});
