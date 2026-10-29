import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAddDataAppGroupsEndpoint,
  setupDataAppGroupsEndpoint,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDataApp,
  createMockDataAppGroup,
  createMockGroup,
} from "metabase-types/api/mocks";

import { AddDataAppGroupsModal } from "./AddDataAppGroupsModal";

function setup() {
  setupGroupsEndpoint([
    createMockGroup({
      id: 1,
      name: "All Users",
      magic_group_type: "all-internal-users",
    }),
    createMockGroup({
      id: 2,
      name: "Administrators",
      magic_group_type: "admin",
    }),
    createMockGroup({ id: 3, name: "Support" }),
    createMockGroup({ id: 4, name: "Finance" }),
  ]);
  const support = createMockDataAppGroup({
    id: 3,
    name: "Support",
    member_count: 12,
  });
  setupDataAppGroupsEndpoint("sales", [support]);
  setupAddDataAppGroupsEndpoint("sales", [
    support,
    createMockDataAppGroup({ id: 4, name: "Finance", member_count: 4 }),
  ]);
  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <AddDataAppGroupsModal
      app={createMockDataApp({ name: "sales", display_name: "Sales" })}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("AddDataAppGroupsModal", () => {
  it("offers only groups the app doesn't have and adds the selected ones", async () => {
    const { onClose } = setup();

    expect(await screen.findByText("Add groups to Sales")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Groups" }));

    expect(
      await screen.findByRole("option", { name: "Finance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Support" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Administrators" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: "Finance" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/apps/sales/groups",
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toEqual({
      group_ids: [4],
    });
  });
});
