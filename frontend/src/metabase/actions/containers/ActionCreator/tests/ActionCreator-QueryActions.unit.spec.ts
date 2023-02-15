import nock from "nock";
import userEvent from "@testing-library/user-event";

import { screen, waitFor, getIcon, queryIcon } from "__support__/ui";

import {
  createMockActionParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { setup, SITE_URL } from "./common";

describe("ActionCreator > Query Actions", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("new action", () => {
    it("renders correctly", async () => {
      await setup();

      expect(screen.getByText(/New action/i)).toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("should disable submit by default", async () => {
      await setup();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("should show clickable data reference icon", async () => {
      await setup();
      getIcon("reference", "button").click();

      expect(screen.getByText("Data Reference")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
    });

    it("should show action settings button", async () => {
      await setup();
      expect(
        screen.getByRole("button", { name: "Action settings" }),
      ).toBeInTheDocument();
    });
  });

  describe("editing action", () => {
    it("renders correctly", async () => {
      const action = createMockQueryAction();
      await setup({ action });

      expect(screen.getByText(action.name)).toBeInTheDocument();
      expect(screen.queryByText(/New action/i)).not.toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders parameters", async () => {
      await setup({
        action: createMockQueryAction({
          parameters: [createMockActionParameter({ name: "FooBar" })],
        }),
      });

      expect(screen.getByText("FooBar")).toBeInTheDocument();
    });

    it("blocks editing if the user doesn't have write permissions for the collection", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, canWrite: false });

      expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      expect(queryIcon("grabber2")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(screen.getByLabelText("Success message")).toBeDisabled();
    });

    it("blocks editing if actions are disabled for the database", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setup({ action, hasActionsEnabled: false });

      expect(screen.getByDisplayValue(action.name)).toBeDisabled();
      expect(queryIcon("grabber2")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Field settings")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      screen.getByLabelText("Action settings").click();

      expect(screen.getByLabelText("Success message")).toBeDisabled();
    });

    describe("admin users and has public sharing enabled", () => {
      const mockUuid = "mock-uuid";
      const action = createMockQueryAction();

      it("should be able to enable action public sharing", async () => {
        await setup({
          action,
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
          action: createMockQueryAction({ public_uuid: mockUuid }),
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
        await setup({ action });

        userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        userEvent.type(
          screen.getByRole("textbox", { name: "Success message" }),
          `Thanks!`,
        );
        expect(
          screen.getByRole("textbox", { name: "Success message" }),
        ).toHaveValue("Thanks!");
      });
    });

    describe("no permission to see public sharing", () => {
      const action = createMockQueryAction();

      it("should not show sharing settings when user is admin but public sharing is disabled", async () => {
        await setup({
          action,
          isAdmin: true,
          isPublicSharingEnabled: false,
        });

        userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );
        expect(
          screen.queryByRole("switch", {
            name: "Make public",
          }),
        ).not.toBeInTheDocument();
      });

      it("should not show sharing settings when user is not admin but public sharing is enabled", async () => {
        await setup({
          action,
          isPublicSharingEnabled: true,
        });

        userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );
        expect(
          screen.queryByRole("switch", {
            name: "Make public",
          }),
        ).not.toBeInTheDocument();
      });
    });
  });
});
