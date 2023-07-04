import userEvent from "@testing-library/user-event";
import { User } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { setupEnterpriseTest } from "__support__/enterprise";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import CreateCollectionForm from "./CreateCollectionForm";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  can_write: true,
});

type SetupOpts = {
  user?: User;
  hasToken?: boolean;
};

function setup({
  user = createMockUser({ is_superuser: true }),
  hasToken = false,
}: SetupOpts = {}) {
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: ROOT_COLLECTION,
  });

  if (hasToken) {
    setupEnterpriseTest();
  }

  const onCancel = jest.fn();
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

  it("calls onCancel when cancel button is clicked", () => {
    const { onCancel } = setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows authority level controls when there is a valid token", () => {
    setup({ hasToken: true });
    expect(screen.getByText(/Collection type/i)).toBeInTheDocument();
    expect(screen.getByText(/Regular/i)).toBeInTheDocument();
    expect(screen.getByText(/Official/i)).toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", () => {
    setup({
      user: createMockUser({ is_superuser: false }),
      hasToken: true,
    });
    expect(screen.queryByText(/Collection type/i)).not.toBeInTheDocument();
  });

  it("does not show authority level controls when there is no valid token", () => {
    setup();
    expect(screen.queryByLabelText(/Collection type/i)).not.toBeInTheDocument();
  });
});
