import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGroupsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { PreviewBand } from "./PreviewBand";
import type { PreviewTarget } from "./types";

const USER_TARGET: PreviewTarget = {
  kind: "user",
  user: createMockUser({ id: 2, common_name: "Sandy Sales" }),
};
const GROUP_TARGET: PreviewTarget = {
  kind: "group",
  group: { id: 9, name: "Sales", magic_group_type: null, member_count: 1 },
};

interface SetupOpts {
  target?: PreviewTarget;
  isStarted?: boolean;
  isExplainOpen?: boolean;
}

function setup({
  target = USER_TARGET,
  isStarted = true,
  isExplainOpen = false,
}: SetupOpts = {}) {
  setupGroupsEndpoint([]);
  fetchMock.get("path:/api/user/2", createMockUser({ id: 2 }));
  const onGoHome = jest.fn();
  const onToggleExplain = jest.fn();
  const onOpenLink = jest.fn();

  renderWithProviders(
    <PreviewBand
      target={target}
      isStarted={isStarted}
      linkText="/dashboard/15"
      onOpenLink={onOpenLink}
      onGoHome={onGoHome}
      isExplainOpen={isExplainOpen}
      onToggleExplain={onToggleExplain}
    />,
  );

  return { onGoHome, onToggleExplain, onOpenLink };
}

function getBand() {
  return screen.getByRole("status", { name: "Previewing as" });
}

describe("PreviewBand", () => {
  describe("while the preview starts", () => {
    it("has no name yet and nothing to explain", () => {
      setup({ isStarted: false });

      expect(getBand()).toHaveTextContent("Starting the preview…");
      expect(getBand()).not.toHaveTextContent("Sandy Sales");
      expect(
        screen.getByRole("button", { name: "Explain access" }),
      ).toBeDisabled();
    });
  });

  describe("a user preview", () => {
    it("says who is previewed, that it is read-only, and has no group trigger", async () => {
      setup();

      expect(getBand()).toHaveTextContent("Previewing as Sandy Sales");
      expect(
        screen.getByRole("button", { name: "Sandy Sales" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /How it works/ }),
      ).not.toBeInTheDocument();

      await userEvent.hover(screen.getByText("Read-only"));
      expect(
        await screen.findByText(
          "Nothing you change here is saved. Previews are recorded in the audit log.",
        ),
      ).toBeVisible();
    });

    it("goes back to all collections from the home button", async () => {
      const { onGoHome } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Back to all collections" }),
      );

      expect(onGoHome).toHaveBeenCalledTimes(1);
    });

    it("shows the path of the frame in the address box", () => {
      setup();

      expect(screen.getByLabelText("Address")).toHaveValue("/dashboard/15");
    });

    it("toggles Explain access, pressed while its sheet is open", async () => {
      const { onToggleExplain } = setup({ isExplainOpen: false });

      const button = screen.getByRole("button", { name: "Explain access" });
      expect(button).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(button);

      expect(onToggleExplain).toHaveBeenCalledTimes(1);
    });

    it("marks Explain access pressed while its sheet is open", () => {
      setup({ isExplainOpen: true });

      expect(
        screen.getByRole("button", { name: "Explain access" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("a group preview", () => {
    it("says a member of the group is previewed, with the trigger that explains it", () => {
      setup({ target: GROUP_TARGET });

      expect(getBand()).toHaveTextContent("Previewing as a member of Sales");
      // jsdom has no media queries, so the window counts as narrow
      expect(
        screen.getByRole("button", { name: "How it works: group preview" }),
      ).toBeInTheDocument();
    });

    it("has no user to hover: the name is plain text", () => {
      setup({ target: GROUP_TARGET });

      expect(
        screen.queryByRole("button", { name: "Sales" }),
      ).not.toBeInTheDocument();
    });
  });
});
