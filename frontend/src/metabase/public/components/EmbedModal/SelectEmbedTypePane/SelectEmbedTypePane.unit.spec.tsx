import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SelectEmbedTypePane } from "./SelectEmbedTypePane";

const setup = ({
  isAdmin = false,
  hasPublicLink = false,
  isResourcePublished = false,
  isStaticEmbeddingEnabled = false,
  isPublicSharingEnabled = false,
}: {
  isAdmin?: boolean;
  hasPublicLink?: boolean;
  isResourcePublished?: boolean;
  isStaticEmbeddingEnabled?: boolean;
  isPublicSharingEnabled?: boolean;
} = {}) => {
  const TEST_DASHBOARD = createMockDashboard({
    public_uuid: hasPublicLink ? "mock-uuid" : undefined,
    enable_embedding: isResourcePublished,
  });

  const onCreatePublicLink = jest.fn();
  const onDeletePublicLink = jest.fn();
  const getPublicUrl = jest.fn(uuid => uuid);
  const goToNextStep = jest.fn();

  const { history } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <SelectEmbedTypePane
          resource={TEST_DASHBOARD}
          resourceType="dashboard"
          onCreatePublicLink={onCreatePublicLink}
          onDeletePublicLink={onDeletePublicLink}
          getPublicUrl={getPublicUrl}
          goToNextStep={goToNextStep}
        />
      )}
    ></Route>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings({
          "enable-public-sharing": isPublicSharingEnabled,
          "enable-embedding-static": isStaticEmbeddingEnabled,
        }),
      }),
      withRouter: true,
    },
  );

  return {
    goToNextStep,
    onCreatePublicLink,
    onDeletePublicLink,
    getPublicUrl,
    history: checkNotNull(history),
  };
};

describe("SelectEmbedTypePane", () => {
  describe("static embed button", () => {
    describe("when the resource is published", () => {
      it("should call `goToNextStep` with `application` when the static embedding option is clicked", async () => {
        const { goToNextStep } = setup({
          isResourcePublished: true,
          isStaticEmbeddingEnabled: true,
        });

        await userEvent.click(screen.getByText("Static embedding"));

        expect(goToNextStep).toHaveBeenCalled();
      });
    });

    describe("when the resource is not published", () => {
      it("should call `goToNextStep` with `application` when the static embedding option is clicked", async () => {
        const { goToNextStep } = setup({
          isResourcePublished: false,
          isStaticEmbeddingEnabled: true,
        });

        await userEvent.click(screen.getByText("Static embedding"));

        expect(goToNextStep).toHaveBeenCalled();
      });
    });
  });

  describe("public embed button", () => {
    describe("when public sharing is disabled", () => {
      it("should redirect to settings when public sharing is disabled and `Settings` is clicked", async () => {
        const { history } = setup({
          isPublicSharingEnabled: false,
        });

        await userEvent.click(screen.getByRole("link", { name: "Settings" }));

        expect(history.getCurrentLocation().pathname).toEqual(
          "/admin/settings/public-sharing",
        );
      });
    });

    describe("when a public link exists", () => {
      it("should render iframe link, copy button, `Copy snippet` description, and `Affects public url and link` tooltip", async () => {
        setup({ hasPublicLink: true, isPublicSharingEnabled: true });

        await userEvent.click(screen.getByText("Get embedding code"));

        expect(screen.getByTestId("public-link-input")).toHaveDisplayValue(
          /<iframe(\s+)src="mock-uuid".*<\/iframe>/s,
        );

        expect(screen.getByTestId("copy-button")).toBeInTheDocument();
        expect(screen.getByText("Remove public link")).toBeInTheDocument();

        await userEvent.hover(screen.getByText("Remove public link"));
        expect(
          screen.getByText(
            "Affects both public link and embed URL for this dashboard",
          ),
        ).toBeInTheDocument();
      });

      it("should call `onDeletePublicLink` when `Remove public link` is clicked", async () => {
        const { onDeletePublicLink } = setup({
          hasPublicLink: true,
          isPublicSharingEnabled: true,
        });

        await userEvent.click(screen.getByText("Get embedding code"));

        await userEvent.click(screen.getByText("Remove public link"));

        expect(onDeletePublicLink).toHaveBeenCalled();
      });
    });

    describe("when a public link doesn't exist", () => {
      it("should render `Get embedding code`", () => {
        setup({ hasPublicLink: false, isPublicSharingEnabled: true });

        expect(screen.getByText("Get embedding code")).toBeInTheDocument();
      });

      it("should call `onCreatePublicLink` when `Get embedding code` is clicked", async () => {
        const { onCreatePublicLink } = setup({ isPublicSharingEnabled: true });

        await userEvent.click(
          screen.getByRole("button", { name: "Get embedding code" }),
        );

        expect(onCreatePublicLink).toHaveBeenCalled();
      });
    });
  });

  describe('"Compare options" button', () => {
    it("should open in a new tab", () => {
      setup();

      const compareOptionsButton = screen.getByRole("link", {
        name: "Compare options",
      });

      expect(compareOptionsButton).toHaveAttribute("target", "_blank");
    });
  });
});
