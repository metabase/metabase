import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createQuery } from "metabase/querying/filters/components/FilterPicker/test-utils";

import { DraftFilterPill } from "./DraftFilterPill";

jest.mock("./UsStatesMap", () => ({ UsStatesMap: () => null }));
jest.mock("./WorldMap", () => ({ WorldMap: () => null }));

describe("DraftFilterPill date filters", () => {
  it("moves focus into the date picker and selects a shortcut with arrow keys", async () => {
    fetchMock.get("/api/prototype/field-categories", []);
    fetchMock.get("/api/prototype/filter-usage", []);
    const onSubmit = jest.fn();
    renderWithProviders(
      <DraftFilterPill
        query={createQuery()}
        stageIndex={0}
        onDraftChange={jest.fn()}
        onSubmit={onSubmit}
        onSubmitFilters={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Type to filter…"),
      "Created At",
    );
    await userEvent.keyboard("{ArrowDown}{Enter}");
    const today = await screen.findByRole("button", { name: "Today" });
    await waitFor(() => expect(today).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(today).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalled();
  });
});
