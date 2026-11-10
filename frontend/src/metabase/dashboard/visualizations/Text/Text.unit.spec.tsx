import userEvent from "@testing-library/user-event";

import { createMockDashboardState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { buildTextTagTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Dashboard,
  ParameterValuesMap,
  VirtualDashboardCard,
} from "metabase-types/api";
import {
  createMockDashboard,
  createMockParameter,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";

import { Text } from "../Text";

interface Settings {
  text: string | null;
}

const defaultProps = {
  dashboard: createMockDashboard(),
  dashcard: createMockVirtualDashCard(),
  gridSize: Text.defaultSize,
  settings: {},
  isEditing: false,
  parameterValues: {},
  isMobile: false,
};

interface SetupOpts {
  settings?: Settings;
  parameterValues?: ParameterValuesMap;
  dashboard?: Dashboard;
  dashcard?: VirtualDashboardCard;
  isEditing?: boolean;
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

    it("should replace mapped variables with formatted parameter values", () => {
      setup({
        ...getMappedVariableOptions(),
        settings: getSettingsWithText("Variable: {{foo}}"),
      });

      expect(screen.getByText("Variable: 1 and 2")).toBeInTheDocument();
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

    it("should render a clickable base64 encoded image", () => {
      const base64Src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const options = {
        settings: getSettingsWithText(
          `[![alt](${base64Src})](https://example.com)`,
        ),
      };
      setup(options);

      const img = screen.getByRole("img", { name: "alt" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", base64Src);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("should not render data URIs that are not images", () => {
      const options = {
        settings: getSettingsWithText(
          `![alt](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)`,
        ),
      };
      setup(options);

      const img = screen.getByRole("img", { name: "alt" });
      expect(img).toBeInTheDocument();
      // The unsafe data URI is stripped, so the image has no source. React 19
      // drops an empty `src` attribute rather than rendering `src=""`.
      expect(img).not.toHaveAttribute("src");
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
      });

      it("should preview the raw template without replacing mapped variables (metabase#31626)", () => {
        setup({
          ...getMappedVariableOptions(),
          settings: getSettingsWithText("Variable: {{foo}}"),
          isEditing: true,
        });

        expect(
          screen.getByTestId("editing-dashboard-text-preview"),
        ).toHaveTextContent("Variable: {{foo}}");
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

function getMappedVariableOptions() {
  const parameter = createMockParameter({ id: "p1", type: "number/=" });
  return {
    dashboard: createMockDashboard({ parameters: [parameter] }),
    dashcard: createMockVirtualDashCard({
      parameter_mappings: [
        {
          parameter_id: parameter.id,
          target: buildTextTagTarget("foo"),
        },
      ],
    }),
    parameterValues: { [parameter.id]: [1, 2] },
  };
}
