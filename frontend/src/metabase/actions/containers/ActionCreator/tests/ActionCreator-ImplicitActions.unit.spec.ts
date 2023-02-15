import nock from "nock";

import { screen, queryIcon } from "__support__/ui";

import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { setup as baseSetup, SetupOpts } from "./common";

async function setup({
  action = createMockImplicitQueryAction(),
  ...opts
}: SetupOpts = {}) {
  await baseSetup({ action, ...opts });
  return { action };
}

describe("ActionCreator > Implicit Actions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

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

    expect(screen.getByText("FooBar")).toBeInTheDocument();
  });

  test.each([
    ["write permissions", true],
    ["read-only permissions", false],
  ])("doesn't let to change the action with %s", async (_, canEdit) => {
    const { action } = await setup({
      action: createMockImplicitQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      }),
      canEdit,
    });

    expect(screen.getByDisplayValue(action.name)).toBeDisabled();

    expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
    expect(queryIcon("grabber2")).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create" }),
    ).not.toBeInTheDocument();
  });
});
