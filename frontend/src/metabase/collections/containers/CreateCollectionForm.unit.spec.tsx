import userEvent from "@testing-library/user-event";
import { TokenFeatures, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";
import { setupEnterpriseTest } from "__support__/enterprise";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import CreateCollectionForm from "./CreateCollectionForm";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  can_write: true,
});

type SetupOpts = {
  user?: User;
  tokenFeatures?: TokenFeatures;
};

async function setup({
  user = createMockUser({ is_superuser: true }),
  tokenFeatures = createMockTokenFeatures(),
}: SetupOpts = {}) {
  mockSettings({ "token-features": tokenFeatures });
  setupEnterpriseTest();
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: ROOT_COLLECTION,
  });

  const onCancel = jest.fn();
  renderWithProviders(<CreateCollectionForm onCancel={onCancel} />, {
    storeInitialState: {
      currentUser: user,
      settings: createMockSettingsState({
        "token-features": tokenFeatures,
      }),
      entities: createMockEntitiesState({
        collections: [ROOT_COLLECTION],
      }),
    },
  });

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { onCancel };
}

describe("CreateCollectionForm", () => {
  it("shows authority level controls when there is a valid token", async () => {
    await setup({
      tokenFeatures: createMockTokenFeatures({ content_management: true }),
    });
    expect(screen.getByText(/Collection type/i)).toBeInTheDocument();
    expect(screen.getByText(/Regular/i)).toBeInTheDocument();
    expect(screen.getByText(/Official/i)).toBeInTheDocument();
  });

  it("displays correct blank state", async () => {
    await setup();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("");

    expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
    expect(screen.getByText("Our analytics")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { onCancel } = await setup();
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it("does not show authority level controls when there is no valid token", async () => {
    await setup();
    expect(screen.queryByLabelText(/Collection type/i)).not.toBeInTheDocument();
  });

  it("does not show authority level controls when the user is not an admin", async () => {
    await setup({
      user: createMockUser({ is_superuser: false }),
      tokenFeatures: createMockTokenFeatures({ content_management: true }),
    });
    expect(screen.queryByText(/Collection type/i)).not.toBeInTheDocument();
  });
});
