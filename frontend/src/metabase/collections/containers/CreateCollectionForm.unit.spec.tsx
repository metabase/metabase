import userEvent from "@testing-library/user-event";
import { TokenFeatures, User } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
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
  tokenFeatures?: TokenFeatures;
};

function setup({
  user = createMockUser({ is_superuser: true }),
  tokenFeatures = createMockTokenFeatures(),
}: SetupOpts = {}) {
  const settings = mockSettings({ "token-features": tokenFeatures });
  const onCancel = jest.fn();

  setupEnterprisePlugins();
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: ROOT_COLLECTION,
  });
  renderWithProviders(<CreateCollectionForm onCancel={onCancel} />, {
    storeInitialState: createMockState({
      currentUser: user,
      settings,
      entities: createMockEntitiesState({
        collections: [ROOT_COLLECTION],
      }),
    }),
  });

  return { onCancel };
}

describe("CreateCollectionForm", () => {
  describe("common", () => {
    it("displays correct blank state", () => {
      setup();

      expect(screen.getByLabelText("Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Name")).toHaveValue("");

      expect(screen.getByLabelText("Description")).toBeInTheDocument();
      expect(screen.getByLabelText("Description")).toHaveValue("");

      expect(screen.getByText(/Collection it's saved in/i)).toBeInTheDocument();
      expect(screen.getByText("Our analytics")).toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create" }),
      ).toBeInTheDocument();
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

    it("does not show authority level controls", () => {
      setup();
      expect(
        screen.queryByLabelText("Collection type"),
      ).not.toBeInTheDocument();
    });
  });

  describe("with content management feature", () => {
    it("shows authority level controls", () => {
      setup({
        tokenFeatures: createMockTokenFeatures({ content_management: true }),
      });

      expect(screen.getByText("Collection type")).toBeInTheDocument();
      expect(screen.getByText("Regular")).toBeInTheDocument();
      expect(screen.getByText("Official")).toBeInTheDocument();
    });

    it("does not show authority level controls when the user is not an admin", () => {
      setup({
        user: createMockUser({ is_superuser: false }),
        tokenFeatures: createMockTokenFeatures({ content_management: true }),
      });

      expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
    });
  });
});
