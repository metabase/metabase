import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { AttributeBar } from "./AttributeBar";

const GROUP = { id: 9, name: "Sales", magic_group_type: null, member_count: 1 };

function setup({
  values = {},
  remappings = ["state", "category"],
}: { values?: Record<string, string>; remappings?: string[] } = {}) {
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      name: "Sample",
      tables: [createMockTable({ id: 10, display_name: "People" })],
    }),
  ]);
  fetchMock.get("path:/api/mt/gtap", [
    {
      id: 1,
      group_id: 9,
      table_id: 10,
      card_id: null,
      permission_id: null,
      attribute_remappings: Object.fromEntries(
        remappings.map((name) => [name, ["variable", ["x"]]]),
      ),
    },
  ]);
  fetchMock.get("path:/api/ee/advanced-permissions/impersonation", []);
  fetchMock.get("express:/api/permissions/graph/group/:id", {
    groups: { 9: { 1: { "view-data": "unrestricted" } } },
    revision: 1,
  });

  const onApply = jest.fn();
  renderWithProviders(
    <AttributeBar group={GROUP} values={values} onApply={onApply} />,
  );
  return { onApply };
}

describe("AttributeBar", () => {
  it("shows one chip per attribute the rules read, with its value or No value", async () => {
    setup({ values: { state: "TX" } });

    expect(
      await screen.findByText("User attributes used by rules:"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /state TX/ })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /category No value/ }),
    ).toBeVisible();
  });

  it("shows nothing when no rule reads an attribute", async () => {
    setup({ remappings: [] });

    await screen.findByTestId("test-wait-marker").catch(() => undefined);
    expect(
      screen.queryByText("User attributes used by rules:"),
    ).not.toBeInTheDocument();
  });

  it("picks a value in a popover that names the rule reading the attribute", async () => {
    const { onApply } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /state/ }));

    expect(
      screen.getByText("Used by row and column security on People"),
    ).toBeVisible();
    await userEvent.type(screen.getByLabelText("state"), "TX");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith("state", "TX");
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("applies on Enter", async () => {
    const { onApply } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /state/ }));
    await userEvent.type(screen.getByLabelText("state"), "CA{Enter}");

    expect(onApply).toHaveBeenCalledWith("state", "CA");
  });

  it("applies an emptied box as no value", async () => {
    const { onApply } = setup({ values: { state: "TX" } });

    await userEvent.click(await screen.findByRole("button", { name: /state/ }));
    await userEvent.clear(screen.getByLabelText("state"));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith("state", "");
  });
});
