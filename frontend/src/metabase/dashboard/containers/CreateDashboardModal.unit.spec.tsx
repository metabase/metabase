import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";

import { createMockCollection } from "metabase-types/api/mocks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { openCollection } from "metabase/containers/ItemPicker/test-utils";
import { CreateDashboardModalConnected } from "./CreateDashboardModal";

const COLLECTION = {
  ROOT: createMockCollection({
    ...ROOT_COLLECTION,
    can_write: true,
  }),
  PARENT: createMockCollection({
    id: 2,
    name: "Parent collection",
    can_write: true,
  }),
  CHILD: createMockCollection({
    id: 3,
    name: "Child collection",
    can_write: true,
  }),
};
COLLECTION.CHILD.location = `/${COLLECTION.PARENT.id}/`;

function setup({
  isCachingEnabled = false,
  mockCreateDashboardResponse = true,
} = {}) {
  const onClose = jest.fn();

  const settings = mockSettings({ "enable-query-caching": isCachingEnabled });

  if (mockCreateDashboardResponse) {
    fetchMock.post(`path:/api/dashboard`, (url, options) => options.body);
  }
  const collections = Object.values(COLLECTION);
  setupCollectionsEndpoints({
    collections,
    rootCollection: COLLECTION.ROOT,
  });

  collections
    .filter(c => c.id !== "root")
    .forEach(c => fetchMock.get(`path:/api/collection/${c.id}`, c));

  renderWithProviders(<CreateDashboardModalConnected onClose={onClose} />, {
    storeInitialState: {
      entities: createMockEntitiesState({ collections }),
      settings,
    },
  });

  return {
    onClose,
  };
}

describe("CreateDashboardModal", () => {
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
    it("should open new collection modal and return to dashboard modal when clicking close", async () => {
      setup();
      const name = "my dashboard";
      userEvent.type(nameField(), name);
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeInTheDocument());
      userEvent.click(newCollBtn());
      await waitFor(() => expect(collModalTitle()).toBeInTheDocument());
      userEvent.click(cancelBtn());
      await waitFor(() => expect(dashModalTitle()).toBeInTheDocument());
      expect(nameField()).toHaveValue(name);
    });
    it("should create collection inside nested folder", async () => {
      setup();
      const name = "my dashboard";
      userEvent.type(nameField(), name);
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeInTheDocument());
      openCollection(COLLECTION.PARENT.name);
      userEvent.click(newCollBtn());
      await waitFor(() => expect(collModalTitle()).toBeInTheDocument());
      expect(collDropdown()).toHaveTextContent(COLLECTION.PARENT.name);
    });
    it("should create collection inside root folder", async () => {
      setup();
      const name = "my dashboard";
      userEvent.type(nameField(), name);
      userEvent.click(collDropdown());
      await waitFor(() => expect(newCollBtn()).toBeInTheDocument());
      userEvent.click(newCollBtn());
      await waitFor(() => expect(collModalTitle()).toBeInTheDocument());
      expect(collDropdown()).toHaveTextContent(COLLECTION.ROOT.name);
    });
  });
});
