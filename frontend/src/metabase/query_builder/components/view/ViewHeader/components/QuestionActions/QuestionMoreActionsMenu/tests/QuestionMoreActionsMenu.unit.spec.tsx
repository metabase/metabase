import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import { downloadToImage } from "metabase/redux/downloads";
import {
  createMockDataset,
  createMockNotification,
} from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

jest.mock("metabase/redux/downloads", () => ({
  ...jest.requireActual("metabase/redux/downloads"),
  downloadToImage: jest.fn(() => ({ type: "MOCK_DOWNLOAD_TO_IMAGE" })),
}));

const mockDownloadToImage = downloadToImage as jest.Mock;

describe("QuestionMoreActionsMenu >", () => {
  beforeEach(() => {
    mockDownloadToImage.mockClear();
  });

  describe("admins", () => {
    it("should show the 'Create an alert' menu item if no alerts exist", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
    });

    it("should show the 'Edit alerts' menu item if alerts exist", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(await screen.findByText("Edit alerts")).toBeInTheDocument();
    });

    it("clicking to edit alerts should open the alert popover", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      await userEvent.click(screen.getByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
    });

    it("should show the 'Save screenshot' menu item", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Save screenshot")).toBeInTheDocument();
    });

    it("should dispatch a presentation screenshot export when clicking Save screenshot", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: true,
        isEmailSetup: true,
        isEnterprise: false,
      });

      await openMenu();
      await userEvent.click(screen.getByText("Save screenshot"));

      expect(mockDownloadToImage).toHaveBeenCalledWith(
        expect.objectContaining({
          opts: expect.objectContaining({
            type: Urls.exportFormatPng,
            imageExportStyle: "presentation",
          }),
        }),
      );
    });
  });

  describe("non-admins", () => {
    // NOTE: canManageSubscriptions doesn't do anything here as it is always "true" for non-EE
    it("should show the 'Create an alert' menu item if no alerts exist", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
    });

    it("should show the 'Edit alerts' menu item if alerts exist", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      expect(screen.getByText("Edit alerts")).toBeInTheDocument();
    });

    it("clicking to edit alerts should open the alert popover", async () => {
      setup({
        alerts: [createMockNotification()],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
      });
      await openMenu();
      await userEvent.click(screen.getByText("Edit alerts"));
      expect(await screen.findByTestId("alert-list-modal")).toBeInTheDocument();
    });

    it("should hide Save screenshot when the question result has an error", async () => {
      setup({
        alerts: [],
        canManageSubscriptions: false,
        isAdmin: false,
        isEmailSetup: true,
        isEnterprise: false,
        result: createMockDataset({
          error: {
            status: 500,
            data: "An error occurred",
          },
        }),
      });
      await openMenu();
      expect(screen.queryByText("Save screenshot")).not.toBeInTheDocument();
    });
  });
});
