import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { checkNotNull } from "metabase/lib/types";
import { mockSettings } from "__support__/settings";
import { SharingPane } from "./SharingPane";

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
  const TEST_DASHBOARD = createMockDashboard({
    public_uuid: hasPublicLink ? "mock-uuid" : undefined,
    enable_embedding: isResourcePublished,
  });

  const onCreatePublicLink = jest.fn();
  const onDeletePublicLink = jest.fn();
  const getPublicUrl = jest.fn(resource => resource.public_uuid);
  const onChangeEmbedType = jest.fn();

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <SharingPane
          resource={TEST_DASHBOARD}
          resourceType="dashboard"
          onCreatePublicLink={onCreatePublicLink}
          onDeletePublicLink={onDeletePublicLink}
          getPublicUrl={getPublicUrl}
          onChangeEmbedType={onChangeEmbedType}
          isPublicSharingEnabled={isPublicSharingEnabled}
        />
      )}
    ></Route>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings({
          "enable-public-sharing": isPublicSharingEnabled,
          "enable-embedding": isApplicationEmbeddingEnabled,
        }),
      }),
      withRouter: true,
    },
  );

  return {
    onChangeEmbedType,
    onCreatePublicLink,
    onDeletePublicLink,
    getPublicUrl,
    history: checkNotNull(history),
  };
};

describe("SharingPane", () => {
  describe("static embed button", () => {
    describe("when the resource is published", () => {
      it("should render `Edit settings`", () => {
        setup({ isResourcePublished: true });

        expect(
          screen.getByRole("button", { name: "Edit settings" }),
        ).toBeInTheDocument();
      });

      it("should call `onChangeEmbedType` with `application` when `Edit settings` is clicked", () => {
        const { onChangeEmbedType } = setup({ isResourcePublished: true });

        userEvent.click(screen.getByRole("button", { name: "Edit settings" }));

        expect(onChangeEmbedType).toHaveBeenCalledWith("application");
      });
    });

    describe("when the resource is not published", () => {
      it("should render `Set this up`", () => {
        setup({ isResourcePublished: false });

        expect(
          screen.getByRole("button", { name: "Set this up" }),
        ).toBeInTheDocument();
      });

      it("should call `onChangeEmbedType` with `application` when `Set this up` is clicked", () => {
        const { onChangeEmbedType } = setup({ isResourcePublished: false });

        userEvent.click(screen.getByRole("button", { name: "Set this up" }));

        expect(onChangeEmbedType).toHaveBeenCalledWith("application");
      });
    });
  });
  describe("public embed button", () => {
    describe("when public sharing is disabled", () => {
      it("should render link to settings and a disabled button with `Get an embed link`", () => {
        setup({ isPublicSharingEnabled: false });

        expect(
          screen.getByText("Public embeds and links are disabled."),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId("sharing-pane-settings-link"),
        ).toBeInTheDocument();

        const embedLinkButton = screen.getByRole("button", {
          name: "Get an embed link",
        });
        expect(embedLinkButton).toBeInTheDocument();
        expect(embedLinkButton).toBeDisabled();
      });

      it("should redirect to settings when public sharing is disabled and `Settings` is clicked", () => {
        const { history } = setup({
          isPublicSharingEnabled: false,
        });

        userEvent.click(screen.getByTestId("sharing-pane-settings-link"));

        expect(history.getCurrentLocation().pathname).toEqual(
          "/admin/settings/public-sharing",
        );
      });
    });

    describe("when a public link exists", () => {
      it("should render iframe link, copy button, `Copy snippet` description, and `Affects public url and link` tooltip", () => {
        setup({ hasPublicLink: true, isPublicSharingEnabled: true });

        expect(
          screen.getByText(
            "Just copy this snippet to add a publicly-visible iframe embed to your web page or blog post.",
          ),
        ).toBeInTheDocument();

        expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
          /<iframe(\s+)src="mock-uuid".*<\/iframe>/s,
        );

        expect(screen.getByTestId("copy-button")).toBeInTheDocument();
        expect(screen.getByText("Remove public URL")).toBeInTheDocument();

        userEvent.hover(screen.getByText("Remove public URL"));
        expect(
          screen.getByText(
            "Affects both embed URL and public link for this dashboard",
          ),
        ).toBeInTheDocument();
      });

      it("should call `onDeletePublicLink` when `Remove public URL` is clicked", () => {
        const { onDeletePublicLink } = setup({
          hasPublicLink: true,
          isPublicSharingEnabled: true,
        });

        userEvent.click(screen.getByText("Remove public URL"));

        expect(onDeletePublicLink).toHaveBeenCalled();
      });
    });
    describe("when a public link doesn't exist", () => {
      it("should render `Get an embed link` and `Use this` description", () => {
        setup({ hasPublicLink: false, isPublicSharingEnabled: true });

        expect(
          screen.getByText(
            "Use this to add a publicly-visible iframe embed to your web page or blog post.",
          ),
        ).toBeInTheDocument();

        expect(screen.getByText("Get an embed link")).toBeInTheDocument();
      });

      it("should call `onCreatePublicLink` when `Get an embed link` is clicked", () => {
        const { onCreatePublicLink } = setup({ isPublicSharingEnabled: true });

        userEvent.click(
          screen.getByRole("button", { name: "Get an embed link" }),
        );

        expect(onCreatePublicLink).toHaveBeenCalled();
      });
    });
  });
});
