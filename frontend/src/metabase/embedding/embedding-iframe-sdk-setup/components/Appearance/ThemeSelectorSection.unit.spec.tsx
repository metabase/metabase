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
  onCustomSelect = jest.fn(),
  onColorChange = jest.fn(),
  onColorReset = jest.fn(),
}: {
  savedThemes?: EmbeddingTheme[];
  theme?: Parameters<typeof ThemeSelectorSection>[0]["theme"];
  onThemeChange?: jest.Mock;
  onCustomSelect?: jest.Mock;
  onColorChange?: jest.Mock;
  onColorReset?: jest.Mock;
} = {}) {
  const utils = renderWithProviders(
    <ThemeSelectorSection
      savedThemes={savedThemes}
      theme={theme}
      onThemeChange={onThemeChange}
      onCustomSelect={onCustomSelect}
      onColorChange={onColorChange}
      onColorReset={onColorReset}
    />,
  );

  return {
    ...utils,
    onThemeChange,
    onCustomSelect,
    onColorChange,
    onColorReset,
  };
}

describe("ThemeSelectorSection", () => {
  describe("with saved themes", () => {
    it("renders Instance theme, saved theme cards, and a Custom card", () => {
      setup();

      expect(screen.getByText("Instance theme")).toBeInTheDocument();
      expect(screen.getByText("Dark Theme")).toBeInTheDocument();
      expect(screen.getByText("Ocean Theme")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("renders an info icon with tooltip on the Instance theme card", async () => {
      setup();

      const infoIcon = within(
        screen.getByTestId("theme-card-Instance theme"),
      ).getByLabelText("Instance theme info");
      expect(infoIcon).toBeInTheDocument();

      await userEvent.hover(infoIcon);

      expect(
        await screen.findByText(
          "Changing the appearance settings will also update this embed.",
        ),
      ).toBeInTheDocument();
    });

    it("selects Instance theme by default and sets no theme", async () => {
      const { onThemeChange } = setup();

      // No theme change should have been called on initial render
      expect(onThemeChange).not.toHaveBeenCalled();

      // Instance theme card should be rendered
      expect(
        screen.getByTestId("theme-card-Instance theme"),
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

    it("clears theme when clicking Instance theme after a saved theme", async () => {
      const { onThemeChange } = setup();

      await userEvent.click(screen.getByTestId("theme-card-Dark Theme"));
      await userEvent.click(screen.getByTestId("theme-card-Instance theme"));

      expect(onThemeChange).toHaveBeenLastCalledWith(undefined);
    });

    it("pre-selects the saved theme card matching theme.id on mount", () => {
      setup({ theme: { id: 2 } });

      expect(screen.getByTestId("theme-card-Ocean Theme")).toHaveAttribute(
        "data-selected",
        "true",
      );
      expect(screen.getByTestId("theme-card-Instance theme")).toHaveAttribute(
        "data-selected",
        "false",
      );
    });

    it("falls back to Instance theme when theme.id does not match any saved theme", () => {
      setup({ theme: { id: 999 } });

      expect(screen.getByTestId("theme-card-Instance theme")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });

    it("pre-selects the Custom card on mount when theme has inline colors but no id", () => {
      setup({ theme: { colors: { brand: "#FF0000" } } });

      expect(screen.getByTestId("theme-card-Custom")).toHaveAttribute(
        "data-selected",
        "true",
      );
      expect(screen.getByTestId("theme-card-Instance theme")).toHaveAttribute(
        "data-selected",
        "false",
      );
      expect(screen.getByText("Brand color")).toBeInTheDocument();
    });

    it("shows color inputs when Custom card is clicked", async () => {
      setup();

      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(screen.getByText("Brand color")).toBeInTheDocument();
      expect(screen.getByText("Text color")).toBeInTheDocument();
      expect(screen.getByText("Background color")).toBeInTheDocument();
    });

    it("initializes Custom from no theme when no theme was previously selected", async () => {
      const { onCustomSelect } = setup();

      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(onCustomSelect).toHaveBeenCalledTimes(1);
      expect(onCustomSelect).toHaveBeenCalledWith(undefined);
    });

    it("initializes Custom with the configurable colors of the previously selected saved theme", async () => {
      const { onCustomSelect } = setup();

      await userEvent.click(screen.getByTestId("theme-card-Dark Theme"));
      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(onCustomSelect).toHaveBeenCalledTimes(1);
      expect(onCustomSelect).toHaveBeenCalledWith({
        brand: "#BB86FC",
        "text-primary": "#FFFFFF",
        background: "#121212",
      });
    });

    it("ignores non-configurable settings (e.g. fontFamily) when initializing Custom from a saved theme", async () => {
      const themesWithExtras: EmbeddingTheme[] = [
        {
          id: 10,
          name: "Extras Theme",
          settings: {
            fontFamily: "Inter",
            colors: {
              brand: "#111111",
              "text-primary": "#222222",
              background: "#333333",
              // Not in the configurable set:
              "text-secondary": "#999999",
            },
          },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const { onCustomSelect } = setup({ savedThemes: themesWithExtras });

      await userEvent.click(screen.getByTestId("theme-card-Extras Theme"));
      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(onCustomSelect).toHaveBeenLastCalledWith({
        brand: "#111111",
        "text-primary": "#222222",
        background: "#333333",
      });
    });

    it("initializes Custom from no theme when switching from Instance theme", async () => {
      const { onCustomSelect } = setup();

      // Select a saved theme, then go back to Instance theme, then click Custom
      await userEvent.click(screen.getByTestId("theme-card-Dark Theme"));
      await userEvent.click(screen.getByTestId("theme-card-Instance theme"));
      await userEvent.click(screen.getByTestId("theme-card-Custom"));

      expect(onCustomSelect).toHaveBeenLastCalledWith(undefined);
    });

    it("hides color inputs when switching from Custom to Instance theme", async () => {
      setup();

      await userEvent.click(screen.getByTestId("theme-card-Custom"));
      expect(screen.getByText("Brand color")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("theme-card-Instance theme"));
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
