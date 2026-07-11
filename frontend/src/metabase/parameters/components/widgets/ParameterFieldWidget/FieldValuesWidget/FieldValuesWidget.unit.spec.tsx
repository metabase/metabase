import userEvent from "@testing-library/user-event";

import { setupParameterSearchValuesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { FieldValue } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { PEOPLE } from "metabase-types/api/mocks/presets";

import { FieldValuesWidget } from "./FieldValuesWidget";
import { metadata, state } from "./testMocks.spec";

// A searchable parameter backed by a static list so typing hits the
// `/api/dataset/parameter/search/:query` endpoint we mock below.
const searchableParameter = createMockParameter({
  values_source_type: "static-list",
  values_source_config: { values: [] },
  values_query_type: "search",
});

function setup({ searchValues }: { searchValues: FieldValue[] }) {
  setupParameterSearchValuesEndpoint("foo", {
    values: searchValues,
    has_more_values: false,
  });

  renderWithProviders(
    <FieldValuesWidget
      value={[]}
      parameter={searchableParameter}
      fields={[checkNotNull(metadata.field(PEOPLE.EMAIL))]}
      onChange={jest.fn()}
    />,
    { storeInitialState: state },
  );
}

describe("FieldValuesWidget", () => {
  // metabase#32985: a malformed field value (not the expected [value, label]
  // array, so it has no `.some` method) must not crash the widget when the
  // user filters. The filter predicate guards with `option?.some?.(...)`.
  it("should not crash when search results contain a malformed option (metabase#32985)", async () => {
    setup({
      // A well-formed option that matches the search, plus a malformed one.
      searchValues: [["foobar"], {} as unknown as FieldValue],
    });

    await userEvent.type(screen.getByPlaceholderText("Search"), "foo");

    // The matching option still renders, proving the filter ran without
    // throwing on the malformed entry...
    expect(await screen.findByText("foobar")).toBeInTheDocument();
    // ...and the ErrorBoundary fallback was never shown.
    expect(screen.queryByTestId("error-boundary")).not.toBeInTheDocument();
  });
});
