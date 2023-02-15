import nock from "nock";
import userEvent, { specialChars } from "@testing-library/user-event";

import { screen, waitFor, queryIcon } from "__support__/ui";

import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import { setup as baseSetup, SITE_URL, SetupOpts } from "./common";

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

  describe("admin users and has public sharing enabled", () => {
    const mockUuid = "mock-uuid";

    it("should show action settings button", async () => {
      await setup({
        isAdmin: true,
        isPublicSharingEnabled: true,
      });

      expect(
        screen.getByRole("button", { name: "Action settings" }),
      ).toBeInTheDocument();
    });

    it("should be able to enable action public sharing", async () => {
      await setup({
        isAdmin: true,
        isPublicSharingEnabled: true,
      });

      screen.getByRole("button", { name: "Action settings" }).click();

      expect(screen.getByText("Action settings")).toBeInTheDocument();
      const makePublicToggle = screen.getByRole("switch", {
        name: "Make public",
      });
      expect(makePublicToggle).not.toBeChecked();
      expect(
        screen.queryByRole("textbox", { name: "Public action link URL" }),
      ).not.toBeInTheDocument();

      screen.getByRole("switch", { name: "Make public" }).click();

      await waitFor(() => {
        expect(makePublicToggle).toBeChecked();
      });

      const expectedPublicLinkUrl = `${SITE_URL}/public/action/${mockUuid}`;
      expect(
        screen.getByRole("textbox", { name: "Public action link URL" }),
      ).toHaveValue(expectedPublicLinkUrl);
    });

    it("should be able to disable action public sharing", async () => {
      await setup({
        action: createMockImplicitQueryAction({ public_uuid: mockUuid }),
        isAdmin: true,
        isPublicSharingEnabled: true,
      });
      screen.getByRole("button", { name: "Action settings" }).click();

      expect(screen.getByText("Action settings")).toBeInTheDocument();
      const makePublicToggle = screen.getByRole("switch", {
        name: "Make public",
      });
      expect(makePublicToggle).toBeChecked();
      const expectedPublicLinkUrl = `${SITE_URL}/public/action/${mockUuid}`;
      expect(
        screen.getByRole("textbox", { name: "Public action link URL" }),
      ).toHaveValue(expectedPublicLinkUrl);

      makePublicToggle.click();
      expect(
        screen.getByRole("heading", { name: "Disable this public link?" }),
      ).toBeInTheDocument();
      screen.getByRole("button", { name: "Yes" }).click();

      await waitFor(() => {
        expect(makePublicToggle).not.toBeChecked();
      });

      expect(
        screen.queryByRole("textbox", { name: "Public action link URL" }),
      ).not.toBeInTheDocument();
    });

    it("should be able to set success message", async () => {
      await setup();

      userEvent.click(screen.getByRole("button", { name: "Action settings" }));

      const messageBox = screen.getByRole("textbox", {
        name: "Success message",
      });
      expect(messageBox).toHaveValue("Thanks for your submission.");

      await waitFor(() => expect(messageBox).toBeEnabled());
      userEvent.type(messageBox, `${specialChars.selectAll}Thanks!`);
      expect(messageBox).toHaveValue("Thanks!");
    });
  });

  describe("no permission to see public sharing", () => {
    it("should not show sharing settings when user is admin but public sharing is disabled", async () => {
      await setup({
        isAdmin: true,
        isPublicSharingEnabled: false,
      });

      userEvent.click(screen.getByRole("button", { name: "Action settings" }));
      expect(
        screen.queryByRole("switch", {
          name: "Make public",
        }),
      ).not.toBeInTheDocument();
    });

    it("should not show sharing settings when user is not admin but public sharing is enabled", async () => {
      await setup({
        isAdmin: false,
        isPublicSharingEnabled: true,
      });

      userEvent.click(screen.getByRole("button", { name: "Action settings" }));
      expect(
        screen.queryByRole("switch", {
          name: "Make public",
        }),
      ).not.toBeInTheDocument();
    });
  });
});
