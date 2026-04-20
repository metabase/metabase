import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import { ThemeSelectorSection } from "./ThemeSelectorSection";

const SAVED_THEMES: EmbeddingTheme[] = [
  {
    id: 1,
    name: "Dark Theme",
    settings: {
      colors: {
        brand: "#BB86FC",
        "text-primary": "#FFFFFF",
        background: "#121212",
      },
      fontFamily: "Inter",
    },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Ocean Theme",
    settings: {
      colors: {
        brand: "#0077B6",
        "text-primary": "#023E8A",
        background: "#CAF0F8",
      },
    },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

function setup({
  savedThemes = SAVED_THEMES,
  theme = undefined,
  onThemeChange = jest.fn(),
  onColorChange = jest.fn(),
  onColorReset = jest.fn(),
}: {
  savedThemes?: EmbeddingTheme[];
  theme?: Parameters<typeof ThemeSelectorSection>[0]["theme"];
  onThemeChange?: jest.Mock;
  onColorChange?: jest.Mock;
  onColorReset?: jest.Mock;
} = {}) {
  const utils = renderWithProviders(
    <ThemeSelectorSection
      savedThemes={savedThemes}
      theme={theme}
      onThemeChange={onThemeChange}
      onColorChange={onColorChange}
      onColorReset={onColorReset}
    />,
  );

  return { ...utils, onThemeChange, onColorChange, onColorReset };
}

describe("ThemeSelectorSection", () => {
  describe("with saved themes", () => {
    it("renders Default Theme, saved theme cards, and a Custom card", () => {
      setup();

      expect(screen.getByText("Default Theme")).toBeInTheDocument();
      expect(screen.getByText("Dark Theme")).toBeInTheDocument();
      expect(screen.getByText("Ocean Theme")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("selects Default Theme by default and sets no theme", async () => {
      const { onThemeChange } = setup();

      // No theme change should have been called on initial render
      expect(onThemeChange).not.toHaveBeenCalled();

      // Default Theme card should be rendered
      expect(
        screen.getByTestId("theme-card-Default Theme"),
      ).toBeInTheDocument();
    });

    it("does not show color inputs by default", () => {
      setup();

      expect(screen.queryByText("Brand color")).not.toBeInTheDocument();
    });

    it("passes the theme id when a saved theme card is clicked", async () => {
      const { onThemeChange } = setup();

      await userEvent.click(screen.getByTestId("theme-card-Dark Theme"));

      expect(onThemeChange).toHaveBeenCalledTimes(1);
      expect(onThemeChange).toHaveBeenCalledWith(1);
    });

    it("clears theme when clicking Default Theme after a saved theme", async () => {
      const { onThemeChange } = setup();

      await userEvent.click(screen.getByTestId("theme-card-Dark Theme"));
      await userEvent.click(screen.getByTestId("theme-card-Default Theme"));

      expect(onThemeChange).toHaveBeenLastCalledWith(undefined);
    });

    it("pre-selects the saved theme card matching theme.id on mount", () => {
      setup({ theme: { id: 2 } });

      expect(screen.getByTestId("theme-card-Ocean Theme")).toHaveAttribute(
        "data-selected",
        "true",
      );
      expect(screen.getByTestId("theme-card-Default Theme")).toHaveAttribute(
        "data-selected",
        "false",
      );
    });

    it("falls back to Default Theme when theme.id does not match any saved theme", () => {
      setup({ theme: { id: 999 } });

      expect(screen.getByTestId("theme-card-Default Theme")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });

    it("shows color inputs when Custom card is clicked", async () => {
      setup();

      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(screen.getByText("Brand color")).toBeInTheDocument();
      expect(screen.getByText("Text color")).toBeInTheDocument();
      expect(screen.getByText("Background color")).toBeInTheDocument();
    });

    it("hides color inputs when switching from Custom to Default Theme", async () => {
      setup();

      await userEvent.click(screen.getByTestId("theme-card-Custom"));
      expect(screen.getByText("Brand color")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("theme-card-Default Theme"));
      expect(screen.queryByText("Brand color")).not.toBeInTheDocument();
    });

    it("shows pencil icon on Custom card when no colors are set", () => {
      setup({ theme: undefined });

      const editButton = within(
        screen.getByTestId("theme-card-Custom"),
      ).getByLabelText(`pencil icon`);

      expect(editButton).toBeInTheDocument();
    });

    it("shows revert icon on Custom card when colors are set", () => {
      setup({ theme: { colors: { brand: "#FF0000" } } });

      expect(screen.getByLabelText("Reset colors")).toBeInTheDocument();
    });

    it("calls onColorReset when revert icon is clicked", async () => {
      const { onColorReset } = setup({
        theme: { colors: { brand: "#FF0000" } },
      });

      await userEvent.click(screen.getByLabelText("Reset colors"));

      expect(onColorReset).toHaveBeenCalledTimes(1);
    });

    it("does not toggle Custom card when revert icon is clicked", async () => {
      const { onThemeChange } = setup({
        theme: { colors: { brand: "#FF0000" } },
      });

      // First select Custom
      await userEvent.click(screen.getByTestId("theme-card-Custom"));
      onThemeChange.mockClear();

      // Click the revert icon — should NOT deselect custom
      await userEvent.click(screen.getByLabelText("Reset colors"));

      // onThemeChange should not have been called (stopPropagation)
      expect(onThemeChange).not.toHaveBeenCalled();
    });
  });

  describe("without saved themes", () => {
    it("shows color inputs directly without theme cards", () => {
      setup({ savedThemes: [] });

      expect(screen.getByText("Brand color")).toBeInTheDocument();
      expect(screen.getByText("Text color")).toBeInTheDocument();
      expect(screen.getByText("Background color")).toBeInTheDocument();

      expect(screen.queryByTestId("theme-card-Custom")).not.toBeInTheDocument();
    });
  });
});
