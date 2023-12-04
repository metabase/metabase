import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import SharingPane from "./SharingPane";

const setup = ({
  isAdmin = false,
  hasPublicLink = false,
  isResourcePublished = false,
  isApplicationEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
}: {
  isAdmin?: boolean;
  hasPublicLink?: boolean;
  isResourcePublished?: boolean;
  isApplicationEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
}) => {
  const TEST_RESOURCE = createMockDashboard({
    public_uuid: hasPublicLink ? "1234567890" : undefined,
    enable_embedding: isResourcePublished,
  });

  const onCreatePublicLink = jest.fn();
  const onDisablePublicLink = jest.fn();
  const getPublicUrl = jest.fn();
  const onChangeEmbedType = jest.fn();

  renderWithProviders(
    <SharingPane
      resource={TEST_RESOURCE}
      resourceType="dashboard"
      onCreatePublicLink={onCreatePublicLink}
      onDisablePublicLink={onDisablePublicLink}
      extensions={[]}
      getPublicUrl={getPublicUrl}
      onChangeEmbedType={onChangeEmbedType}
      isPublicSharingEnabled={isPublicSharingEnabled}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState({
          "enable-public-sharing": isPublicSharingEnabled,
          "enable-embedding": isApplicationEmbeddingEnabled,
        }),
      }),
    },
  );

  return {
    onChangeEmbedType,
    onCreatePublicLink,
    onDisablePublicLink,
    getPublicUrl,
  }
};

describe("SharingPane", () => {
  describe("static embed button", () => {
    describe("rendering the button", () => {
      it("should render `Edit settings` when the resource is published", () => {
        setup({ isResourcePublished: true });

        expect(screen.getByRole("button", { name: /edit settings/i })).toBeInTheDocument();
      })
      it("should render `Set this up` when the resource isn't published", () => {
        setup({ isResourcePublished: false });

        expect(screen.getByRole("button", { name: /set this up/i })).toBeInTheDocument();
      })
    })

    describe("when clicking the button", () => {
      it("should call `onChangeEmbedType` with `application` when `Set this up` is clicked", () => {
        const {onChangeEmbedType} = setup({ isResourcePublished: false });

        screen.getByRole("button", { name: /set this up/i }).click();

        expect(onChangeEmbedType).toHaveBeenCalledWith("application");
      })

      it("should call `onChangeEmbedType` with `application` when `Edit settings` is clicked", () => {
        const {onChangeEmbedType} = setup({ isResourcePublished: true });

        screen.getByRole("button", { name: /edit settings/i }).click();

        expect(onChangeEmbedType).toHaveBeenCalledWith("application");
      })
    })
  });

  describe("public embed button", () => {
    describe("rendering the button", () => {
      it("should render iframe link, copy button, and `Copy snippet` description when public link exists", () => {

      });
      it("should render `Get an embed link` and `Use this` description when public link doesn't exist", () => {});
      it("should render link to settings and a disabled button with `Get an embed link` when public sharing is disabled", () => {});
    });

    describe("when creating and disabling iframes", () => {
      it("should call `onCreatePublicLink` when `Get an embed link` is clicked", () => {});
      it("should call `onDisablePublicLink` when `Disable public link` is clicked", () => {});
      it("should display an iframe link when the resource has a UUID", () => {});
      it("should redirect to settings when public sharing is disabled and `Settings` is clicked", () => {});
    });

  });
});
