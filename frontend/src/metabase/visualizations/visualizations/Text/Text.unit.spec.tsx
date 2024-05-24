import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import { color } from "metabase/lib/colors";
import type { ParameterValueOrArray } from "metabase-types/api";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { Text } from "../Text";

interface Settings {
  text: string | null;
}

const defaultProps = {
  onUpdateVisualizationSettings: null,
  className: null,
  dashboard: {},
  dashcard: {},
  gridSize: Text.defaultSize,
  settings: {},
  isEditing: false,
  parameterValues: {},
  isMobile: false,
};

interface SetupOpts {
  settings?: Settings;
  parameterValues?: Record<string, ParameterValueOrArray>;
}

const setup = ({ parameterValues, ...options }: SetupOpts = {}) => {
  renderWithProviders(<Text {...defaultProps} {...options} />, {
    storeInitialState: {
      dashboard: createMockDashboardState({
        parameterValues,
      }),
    },
  });
};

describe("Text", () => {
  describe("Saved (not editing)", () => {
    it("should render plain text", () => {
      const options = {
        settings: getSettingsWithText("Plain text"),
      };
      setup(options);

      expect(screen.getByText("Plain text")).toBeInTheDocument();
    });

    it("should render simple markdown", () => {
      const options = {
        settings: getSettingsWithText("**Bold text**"),
      };
      setup(options);

      expect(screen.getByText("Bold text")).toHaveStyle("font-weight: bold");
    });

    it("should render an internal link", () => {
      const options = {
        settings: getSettingsWithText("[Internal link](/)"),
      };
      setup(options);

      expect(screen.getByText("Internal link")).toHaveAttribute("href", "/");
      expect(screen.getByText("Internal link")).not.toHaveAttribute(
        "target",
        "_blank",
      );
      expect(screen.getByText("Internal link")).not.toHaveAttribute(
        "rel",
        "noreferrer",
      );
    });

    it("should render an external link", () => {
      const options = {
        settings: getSettingsWithText("[External link](https://example.com)"),
      };
      setup(options);

      expect(screen.getByText("External link")).toHaveAttribute(
        "href",
        "https://example.com",
      );
      expect(screen.getByText("External link")).toHaveAttribute(
        "target",
        "_blank",
      );
      expect(screen.getByText("External link")).toHaveAttribute(
        "rel",
        "noreferrer",
      );
    });
  });

  describe("Editing", () => {
    describe("Preview/Unfocused", () => {
      it("should preview with placeholder and styling for no content", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-text-preview"),
        ).toHaveTextContent(
          "You can use Markdown here, and include variables {{like_this}}",
        );
        expect(screen.getByTestId("editing-dashboard-text-container"))
          .toHaveStyle(`border: 1px solid ${color("brand")};
                        color: ${color("text-light")};`);
      });

      it("should preview with text when it has content", () => {
        const options = {
          settings: getSettingsWithText("text text text"),
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-text-preview"),
        ).toHaveTextContent("text text text");
      });
    });

    describe("Edit/Focused", () => {
      it("should display and focus textarea when clicked", async () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-text-preview"),
        );
        expect(
          screen.getByTestId("editing-dashboard-text-input"),
        ).toHaveFocus();
      });

      it("should have input placeholder when it has no content", async () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-text-preview"),
        );
        expect(
          screen.getByPlaceholderText(
            "You can use Markdown here, and include variables {{like_this}}",
          ),
        ).toBeInTheDocument();
      });

      it("should render input text when it has content", async () => {
        const options = {
          settings: getSettingsWithText("text text text"),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-text-preview"),
        );
        expect(screen.getByDisplayValue("text text text")).toBeInTheDocument();
      });

      it("should call onUpdateVisualizationSettings on blur", async () => {
        const mockOnUpdateVisualizationSettings = jest.fn();
        const options = {
          settings: getSettingsWithText("text"),
          isEditing: true,
          onUpdateVisualizationSettings: mockOnUpdateVisualizationSettings,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-text-preview"),
        );
        await userEvent.type(screen.getByRole("textbox"), "foo");
        await userEvent.tab();

        expect(mockOnUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
        expect(mockOnUpdateVisualizationSettings).toHaveBeenCalledWith({
          text: "textfoo",
        });
      });
    });
  });
});

function getSettingsWithText(text: string | null): Settings {
  return {
    text: text,
  };
}
