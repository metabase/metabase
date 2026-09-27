import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupJevQuestionFilterSlotsEndpoint,
  setupJevQuestionFiltersEndpoint,
} from "__support__/server-mocks/jev";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  JevFilterSuggestion,
  JevQuestionColumn,
} from "metabase/api/jev-filters";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { getJevQuestionColumns } from "../../question-utils";

import { JevQuestionFilterPalette } from "./JevQuestionFilterPalette";

const QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
const COLUMNS = Array.from(
  getJevQuestionColumns(QUERY).values(),
  ({ info }) => info,
);

function getColumn(displayName: string): JevQuestionColumn {
  const column = COLUMNS.find((column) => column.display_name === displayName);
  if (!column) {
    throw new Error(`No column ${displayName}`);
  }
  return column;
}

const CATEGORY = getColumn("Product → Category");
const CREATED_AT = getColumn("Created At");
const RATING = getColumn("Product → Rating");

const CATEGORY_SUGGESTION: JevFilterSuggestion = {
  parameter_id: CATEGORY.key,
  parameter_name: CATEGORY.display_name,
  parameter_type: "string/=",
  value: ["Gizmo"],
  label: "Gizmo",
  confidence: 0.96,
  alternatives: [
    { value: ["Gizmo"], label: "Gizmo", probability: 0.96 },
    { value: ["Gadget"], label: "Gadget", probability: 0.02 },
  ],
};

const CREATED_AT_SUGGESTION: JevFilterSuggestion = {
  parameter_id: CREATED_AT.key,
  parameter_name: CREATED_AT.display_name,
  parameter_type: "date/all-options",
  value: "past1quarters",
  label: "Previous quarter",
  confidence: 0.96,
  alternatives: [],
};

const RATING_SUGGESTION: JevFilterSuggestion = {
  parameter_id: RATING.key,
  parameter_name: RATING.display_name,
  parameter_type: "number/between",
  value: [4, 5],
  label: "between 4 and 5",
  confidence: 0.99,
  alternatives: [
    {
      value: [4, 5],
      label: "between 4 and 5",
      probability: 0.99,
      parameter_type: "number/between",
    },
    {
      value: [4],
      label: "at least 4",
      probability: 0.01,
      parameter_type: "number/>=",
    },
  ],
};

function setup() {
  setupJevQuestionFilterSlotsEndpoint({
    status: "ok",
    elapsed_ms: 190,
    jev_ms: 160,
    slots: [
      {
        key: CATEGORY.key,
        display_name: CATEGORY.display_name,
        kind: "values",
        probability: 0.9,
      },
      {
        key: CREATED_AT.key,
        display_name: CREATED_AT.display_name,
        kind: "date",
        probability: 0.8,
      },
    ],
  });
  setupJevQuestionFiltersEndpoint({
    status: "ok",
    filters: [CATEGORY_SUGGESTION, CREATED_AT_SUGGESTION, RATING_SUGGESTION],
    candidate_count: 3,
    elapsed_ms: 250,
    jev_ms: 210,
  });
  const onQueryChange = jest.fn();
  renderWithProviders(
    <JevQuestionFilterPalette
      query={QUERY}
      questionName="Orders"
      onQueryChange={onQueryChange}
    />,
  );
  return { onQueryChange };
}

function getFilterNames(query: Lib.Query) {
  return Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );
}

describe("JevQuestionFilterPalette", () => {
  it("opens with Ctrl+F and lists the filters Jev expects", async () => {
    setup();

    await userEvent.keyboard("{Control>}f{/Control}");

    expect(
      await screen.findByRole("option", { name: "Product → Category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Created At" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("jev-filter-latency")).toHaveTextContent(
      "Jev · 160ms",
    );

    const slotsCall = fetchMock.callHistory.lastCall(
      "path:/api/jev/filters/question/slots",
    );
    const body = await slotsCall?.request?.json();
    expect(body.question_name).toBe("Orders");
    expect(body.columns).toEqual(COLUMNS);
  });

  it("does not open when focus is in a text field", async () => {
    setup();
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();

    await userEvent.keyboard("{Control>}f{/Control}");

    expect(screen.queryByTestId("jev-filter-palette")).not.toBeInTheDocument();
    input.remove();
  });

  it("adds the picked filters to the query on Enter", async () => {
    const { onQueryChange } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Filter with Jev/ }),
    );
    await screen.findByRole("option", { name: "Product → Category" });
    const input = screen.getByRole("combobox", {
      name: "Describe your filters",
    });
    await userEvent.type(input, "gizmos rated 4+ last quarter");

    // Rating wasn't a slot, so it's appended once Jev mentions it.
    const ratingRow = await screen.findByRole("option", {
      name: "Product → Rating",
    });
    expect(within(ratingRow).getByText("at least 4")).toBeInTheDocument();

    // Pick the alternative, which carries its own operator.
    await userEvent.keyboard("{ArrowUp}{Tab}{Enter}");

    await waitFor(() => expect(onQueryChange).toHaveBeenCalledTimes(1));
    expect(getFilterNames(onQueryChange.mock.calls[0][0])).toEqual([
      "Category is Gizmo",
      "Created At is in the previous quarter",
      "Rating is greater than or equal to 4",
    ]);

    const suggestCall = fetchMock.callHistory.lastCall(
      "path:/api/jev/filters/question",
    );
    expect(await suggestCall?.request?.json()).toEqual({
      text: "gizmos rated 4+ last quarter",
      question_name: "Orders",
      columns: COLUMNS,
      slot_keys: [CATEGORY.key, CREATED_AT.key],
    });
  });
});
