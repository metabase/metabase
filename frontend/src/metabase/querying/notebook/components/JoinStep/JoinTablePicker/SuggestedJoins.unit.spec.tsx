import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { useSuggestJoinEdgesMutation } from "metabase/api/jev";
import { Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
} from "metabase-lib/query/test-helpers";

import { SuggestedJoins } from "./SuggestedJoins";

jest.mock("metabase/api/jev", () => ({
  useSuggestJoinEdgesMutation: jest.fn(),
}));

const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
function setup(unwrap: () => Promise<unknown>) {
  const abort = jest.fn();
  const find = jest.fn().mockReturnValue({ unwrap, abort });
  jest
    .mocked(useSuggestJoinEdgesMutation)
    // Only the trigger is consumed; the RTK mutation state is unused.
    .mockReturnValue([find, {}] as ReturnType<
      typeof useSuggestJoinEdgesMutation
    >);
  const onSelect = jest.fn().mockResolvedValue(undefined);
  const view = renderWithProviders(
    <Menu opened>
      <Menu.Dropdown>
        <SuggestedJoins query={query} stageIndex={0} onSelect={onSelect} />
      </Menu.Dropdown>
    </Menu>,
  );
  return { ...view, find, onSelect, abort };
}

it("automatically offers named relationships without applying a join", async () => {
  const { find, onSelect } = setup(async () => ({
    status: "ok",
    suggestions: [
      {
        table_id: 2,
        table_name: "Customers",
        schema: "public",
        source_table_id: 1,
        source_field_id: 10,
        target_field_id: 20,
        condition: "Orders.Customer ID = Customers.ID",
        existing_fk: true,
        confidence: 1,
      },
    ],
  }));
  expect(await screen.findByText("Customers")).toBeInTheDocument();

  expect(screen.getByText(/Foreign key/)).toBeInTheDocument();
  expect(find).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Customers"));
  expect(onSelect).toHaveBeenCalledWith(2);
});

it("keeps browsing available when inference fails", async () => {
  setup(async () => {
    throw new Error("offline");
  });
  expect(
    await screen.findByText("Suggestions unavailable. Browse tables below."),
  ).toBeInTheDocument();
  expect(screen.getByText("Browse all tables")).toBeInTheDocument();
});

it("discards a request when the picker closes", async () => {
  const { unmount, abort } = setup(() => new Promise(() => {}));
  unmount();
  await waitFor(() => expect(abort).toHaveBeenCalledTimes(1));
});
