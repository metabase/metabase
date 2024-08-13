import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import {
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./common";
import { setup as baseSetup, SITE_URL } from "./common";

async function setup({
  action = createMockImplicitQueryAction(),
  ...opts
}: SetupOpts = {}) {
  await baseSetup({ action, ...opts });
  return { action };
}

describe("ActionCreator > Sharing", () => {
  describe.each([
    ["query", createMockQueryAction],
    ["implicit", createMockImplicitQueryAction],
  ])(`%s actions`, (_, getAction) => {
    describe("admin users and has public sharing enabled", () => {
      const mockUuid = "mock-uuid";
      const privateAction = getAction();
      const publicAction = getAction({ public_uuid: mockUuid });

      it("should show action settings button", async () => {
        await setup({
          action: privateAction,
          isAdmin: true,
          isPublicSharingEnabled: true,
        });

        expect(
          screen.getByRole("button", { name: "Action settings" }),
        ).toBeInTheDocument();
      });

      it("should be able to enable action public sharing", async () => {
        await setup({
          action: privateAction,
          isAdmin: true,
          isPublicSharingEnabled: true,
        });

        await userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        const headerTitle = await screen.findByTestId("sidebar-header-title");
        expect(headerTitle).toBeInTheDocument();
        expect(headerTitle).toHaveTextContent("Action settings");
        const makePublicToggle = screen.getByRole("switch", {
          name: "Make public",
        });
        expect(makePublicToggle).not.toBeChecked();
        expect(
          screen.queryByRole("textbox", { name: "Public action form URL" }),
        ).not.toBeInTheDocument();

        await userEvent.click(
          screen.getByRole("switch", { name: "Make public" }),
        );

        await waitFor(() => {
          expect(makePublicToggle).toBeChecked();
        });

        const expectedPublicLinkUrl = `${SITE_URL}/public/action/${mockUuid}`;
        expect(
          screen.getByRole("textbox", { name: "Public action form URL" }),
        ).toHaveValue(expectedPublicLinkUrl);
      });

      it("should be able to disable action public sharing", async () => {
        await setup({
          action: publicAction,
          isAdmin: true,
          isPublicSharingEnabled: true,
        });
        await userEvent.click(
          screen.getByRole("button", { name: "Action settings" }),
        );

        const headerTitle = await screen.findByTestId("sidebar-header-title");
        expect(headerTitle).toBeInTheDocument();
        expect(headerTitle).toHaveTextContent("Action settings");
        const makePublicToggle = screen.getByRole("switch", {
          name: "Make public",
        });
        expect(makePublicToggle).toBeChecked();
        const expectedPublicLinkUrl = `${SITE_URL}/public/action/${mockUuid}`;
        expect(
          screen.getByRole("textbox", { name: "Public action form URL" }),
        ).toHaveValue(expectedPublicLinkUrl);

        await userEvent.click(makePublicToggle);
        expect(
          screen.getByRole("heading", { name: "Disable this public link?" }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Yes" }));

        await waitFor(() => {
          expect(makePublicToggle).not.toBeChecked();
        });

        expect(
          screen.queryByRole("textbox", { name: "Public action form URL" }),
        ).not.toBeInTheDocument();
      });
    });

    describe("no permission to see public sharing", () => {
      it("should not show sharing settings when user is admin but public sharing is disabled", async () => {
        await setup({
          action: getAction(),
          isAdmin: true,
          isPublicSharingEnabled: false,
        });

        await userEvent.click(
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
          action: getAction(),
          isPublicSharingEnabled: true,
        });

        await userEvent.click(
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
