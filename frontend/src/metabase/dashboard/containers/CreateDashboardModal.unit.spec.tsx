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
});
