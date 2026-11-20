import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupPermissionPreviewAttributesEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockGroup,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { ViewAsModal } from "./ViewAsModal";
import type { AffectingAttribute } from "./api";

const CATEGORY: AffectingAttribute = {
  attribute: "category",
  value: "Doohickey",
  uses: [
    {
      kind: "sandbox",
      label: "Products",
      table_id: 1,
      column: "Products.Category",
    },
  ],
  applies: false,
  other_values: ["Gizmo"],
};

describe("ViewAsModal", () => {
  it("asks for no attribute values when the previewed person is a user, though a rule reads an attribute", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("textbox", { name: "Who to preview" }),
    );
    await userEvent.click(await screen.findByText("Sandy Sales"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View app" })).toBeEnabled(),
    );
    expect(
      screen.queryByRole("toolbar", { name: "User attributes used by rules" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Pick the user attribute values to preview this group with.",
      ),
    ).not.toBeInTheDocument();
  });

  it("guard: asks for the attribute values when the previewed person is a group", async () => {
    setup();

    await userEvent.click(screen.getByRole("radio", { name: "Group" }));
    await userEvent.click(
      screen.getByRole("textbox", { name: "Who to preview" }),
    );
    await userEvent.click(await screen.findByText("Sales"));

    expect(
      await screen.findByText(
        "Pick the user attribute values to preview this group with.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      "categoryDoohickey",
    );
  });
});

function setup() {
  setupUsersEndpoints([
    createMockUserListResult({ id: 2, common_name: "Sandy Sales" }),
  ]);
  setupGroupsEndpoint([
    createMockGroup({ id: 3, name: "Sales", magic_group_type: null }),
  ]);
  setupPermissionPreviewAttributesEndpoint([CATEGORY]);

  renderWithProviders(
    <ViewAsModal opened onClose={jest.fn()} path="/collection/root" />,
  );
}
