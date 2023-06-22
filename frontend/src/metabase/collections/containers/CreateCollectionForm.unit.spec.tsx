import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";

import { Collection, User } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

import CreateCollectionForm from "./CreateCollectionForm";

const ROOT_COLLECTION = {
  id: "root",
  name: "Our analytics",
  can_write: true,
} as Collection;

type SetupOpts = {
  user?: User;
  onCancel?: (() => void) | null;
};

function setup({
  user = createMockUser({ is_superuser: true }),
  onCancel = jest.fn(),
}: SetupOpts = {}) {
  fetchMock.post("path:/api/collection", async url => {
    return createMockCollection(await fetchMock.lastCall(url)?.request?.json());
  });

  renderWithProviders(<CreateCollectionForm onCancel={onCancel} />, {
    storeInitialState: {
      currentUser: user,
      entities: createMockEntitiesState({
        collections: [ROOT_COLLECTION],
      }),
    },
  });

  return { onCancel };
}

describe("CreateCollectionForm", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/collection", [ROOT_COLLECTION]);
  });

  it("displays correct blank state", () => {
    setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", () => {
    setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("doesn't show cancel button if onCancel props is not set", () => {
    setup({ onCancel: null });
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { onCancel } = setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Collection authority level", () => {
    describe("Free plan", () => {
      it("is not shown", () => {
        setup();
        expect(
          screen.queryByLabelText(/Collection type/i),
        ).not.toBeInTheDocument();
      });
    });

    describe("Paid plan", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is shown", async () => {
        setup();
        expect(await screen.findByText(/Collection type/i)).toBeInTheDocument();
        expect(screen.getByText(/Regular/i)).toBeInTheDocument();
        expect(screen.getByText(/Official/i)).toBeInTheDocument();
      });

      it("isn't shown if user is not admin", async () => {
        setup({ user: createMockUser({ is_superuser: false }) });
        expect(screen.queryByText(/Collection type/i)).not.toBeInTheDocument();
      });
    });
  });
});
