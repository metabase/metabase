import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { createMockEntitiesState } from "__support__/store";

import { mockSettings } from "__support__/settings";

import type { Collection } from "metabase-types/api";
import CreateDashboardModal from "./CreateDashboardModal";

const ROOT_COLLECTION = {
  id: "root",
  name: "Our analytics",
  can_write: true,
} as Collection;

function setup({
  isCachingEnabled = false,
  mockCreateDashboardResponse = true,
} = {}) {
  const onClose = jest.fn();

  const settings = mockSettings({ "enable-query-caching": isCachingEnabled });

  if (mockCreateDashboardResponse) {
    fetchMock.post(`path:/api/dashboard`, (url, options) => options.body);
  }

  renderWithProviders(<CreateDashboardModal onClose={onClose} />, {
    storeInitialState: {
      entities: createMockEntitiesState({
        collections: [ROOT_COLLECTION],
      }),
      settings,
    },
  });

  return {
    onClose,
  };
}

describe("CreateDashboardModal", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/collection", [ROOT_COLLECTION]);
  });

  it("displays empty form fields", () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Create" }),
    ).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", async () => {
    const { onClose } = setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }) as Element);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cache TTL field", () => {
    describe("OSS", () => {
      it("is not shown", () => {
        setup({ isCachingEnabled: true });
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is not shown", () => {
        setup({ isCachingEnabled: true });
        expect(screen.queryByText("More options")).not.toBeInTheDocument();
        expect(
          screen.queryByText("Cache all question results for"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("new collection modal", () => {
    const nameField = () => screen.getByRole("textbox", { name: /name/i });
    const collDropdown = () => screen.getByTestId("select-button");
    const newCollBtn = () =>
      screen.getByRole("button", {
        name: /new collection/i,
      });
    const collModalTitle = () =>
      screen.getByRole("heading", { name: /new collection/i });
    const dashModalTitle = () =>
      screen.getByRole("heading", { name: /new dashboard/i });
    const cancelBtn = () => screen.getByRole("button", { name: /cancel/i });

    it("should have a new collection button in the collection picker", async () => {
      setup();
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeInTheDocument());
    });
    it("should not be accessible if the dashboard form is invalid", async () => {
      setup();
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeDisabled());
    });
    it("should open new collection modal and return to dashboard modal when clicking close", async () => {
      setup();
      userEvent.type(nameField(), "my dashboard");
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeEnabled());
      userEvent.click(newCollBtn());
      await waitFor(() => expect(collModalTitle()).toBeInTheDocument());
      userEvent.click(cancelBtn());
      await waitFor(() => expect(dashModalTitle()).toBeInTheDocument());
      expect(nameField()).toHaveValue("my dashboard");
    });
  });
});
