import { screen, queryIcon } from "__support__/ui";
import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./common";
import { setup as baseSetup } from "./common";

async function setup({
  action = createMockImplicitQueryAction(),
  ...opts
}: SetupOpts = {}) {
  await baseSetup({ action, ...opts });
  return { action };
}

describe("ActionCreator > Implicit Actions", () => {
  it("renders correctly", async () => {
    const { action } = await setup();

    expect(screen.getByText(action.name)).toBeInTheDocument();
    expect(screen.getByText("Auto tracking schema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    expect(screen.queryByText(/New action/i)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mock-native-query-editor"),
    ).not.toBeInTheDocument();
  });

  it("renders parameters", async () => {
    await setup({
      action: createMockImplicitQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      }),
    });

    expect(screen.getAllByText("FooBar")).toHaveLength(2);
  });

  it("allows only form settings changes", async () => {
    const { action } = await setup({
      action: createMockImplicitQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      }),
    });

    expect(screen.getByDisplayValue(action.name)).toBeDisabled();
    expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
    expect(queryIcon("grabber")).not.toBeInTheDocument();
  });

  it("blocks editing if the user doesn't have write permissions for the collection", async () => {
    const { action } = await setup({
      action: createMockImplicitQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      }),
      canWrite: false,
    });

    expect(screen.getByDisplayValue(action.name)).toBeDisabled();

    expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
    expect(queryIcon("grabber")).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create" }),
    ).not.toBeInTheDocument();
  });
});
