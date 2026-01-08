import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import { buildTextTagTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Dashboard,
  DashboardParameterMapping,
  Parameter,
  ParameterValuesMap,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockDashboard,
  createMockHeadingDashboardCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { Heading } from "../Heading";

interface Settings {
  text: string;
}

interface Options {
  dashcard?: VirtualDashboardCard;
  isEditing?: boolean;
  isEditingParameter?: boolean;
  onUpdateVisualizationSettings?: ({ text }: { text: string }) => void;
  settings?: VisualizationSettings;
  dashboard?: Dashboard;
  parameterValues?: ParameterValuesMap;
}

const defaultProps = {
  dashcard: createMockVirtualDashCard(),
  dashboard: createMockDashboard(),
  isEditing: false,
  isFullscreen: false,
  isMobile: false,
  onUpdateVisualizationSettings: () => {
    return;
  },
  settings: { text: "" },
  parameterValues: {},
  gridSize: { x: 0, y: 0, width: 0, height: 0 },
};

const setup = ({ parameterValues, isEditingParameter, ...props }: Options) => {
  const dashboard = props.dashboard || defaultProps.dashboard;
  const dashcard = props.dashcard || defaultProps.dashcard;

  renderWithProviders(
    <MockDashboardContext dashboard={dashboard} isEditing={props.isEditing}>
      <Heading {...defaultProps} {...props} />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          parameterValues,
          dashboards: {
            [dashboard.id]: {
              ...dashboard,
              dashcards: dashboard.dashcards.map((dc) => dc.id),
            },
          },
          dashcards: { [dashcard.id]: dashcard },
          sidebar: isEditingParameter
            ? {
                name: "editParameter",
                props: { parameterId: "param" },
              }
            : undefined,
        }),
      },
    },
  );
};

describe("Text", () => {
  describe("Saved (Not Editing)", () => {
    it("should be able to render with text", () => {
      const options = {
        settings: getSettingsWithText("Example Heading"),
      };
      setup(options);

      expect(
        screen.getByTestId("saved-dashboard-heading-content"),
      ).toHaveTextContent("Example Heading");
    });

    it("should replace mapped variables with parameter values", () => {
      const variableName = "foo_bar";
      const text = `Variable: {{${variableName}}}`;

      const parameterValue = 15;

      const { parameters, parameterValues, parameter_mappings } =
        mapParameterToVariable({ variableName, parameterValue });

      const options = {
        settings: getSettingsWithText(text),
        dashcard: createMockVirtualDashCard({ parameter_mappings }),
        dashboard: createMockDashboard({ parameters }),
        parameterValues: parameterValues,
      };
      setup(options);

      expect(
        screen.getByTestId("saved-dashboard-heading-content"),
      ).toHaveTextContent(`Variable: ${parameterValue}`);
    });
  });

  describe("Editing Dashboard", () => {
    describe("Preview/Unfocused", () => {
      it("should preview with placeholder and styling for no content", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-heading-preview"),
        ).toHaveTextContent(
          "You can connect widgets to {{variables}} in heading cards.",
        );
        expect(screen.getByTestId("editing-dashboard-heading-container"))
          .toHaveStyle(`border: 1px solid var(--mb-color-brand);
                        color: var(--mb-color-text-tertiary);`);
      });

      it("should preview with text when it has content", () => {
        const options = {
          settings: getSettingsWithText("Example Heading"),
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-heading-preview"),
        ).toHaveTextContent("Example Heading");
      });

      it("should preview without replacing mapped variables with parameter values", () => {
        const variableName = "variable";
        const text = `Variable: {{${variableName}}}`;

        const parameterValue = 15;

        const { parameters, parameterValues, parameter_mappings } =
          mapParameterToVariable({ variableName, parameterValue });

        const options = {
          settings: getSettingsWithText(text),
          dashcard: createMockVirtualDashCard({ parameter_mappings }),
          dashboard: createMockDashboard({ parameters }),
          parameterValues: parameterValues,
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-heading-preview"),
        ).toHaveTextContent("Variable: {{variable}}");
      });
    });

    describe("Edit/Focused", () => {
      it("should display and focus input when clicked", async () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(
          screen.getByTestId("editing-dashboard-heading-input"),
        ).toHaveFocus();
      });

      it("should have input placeholder when it has no content", async () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(
          screen.getByPlaceholderText(
            "You can connect widgets to {{variables}} in heading cards.",
          ),
        ).toBeInTheDocument();
      });

      it("should render input text when it has content", async () => {
        const options = {
          settings: getSettingsWithText("Example Heading"),
          isEditing: true,
        };
        setup(options);

        await userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(screen.getByDisplayValue("Example Heading")).toBeInTheDocument();
      });

      it("should show input without replacing mapped variables with parameter values", async () => {
        const variableName = "variable";
        const text = `Variable: {{${variableName}}}`;

        const parameterValue = 15;

        const { parameters, parameterValues, parameter_mappings } =
          mapParameterToVariable({ variableName, parameterValue });

        const options = {
          settings: getSettingsWithText(text),
          dashcard: createMockVirtualDashCard({ parameter_mappings }),
          dashboard: createMockDashboard({ parameters }),
          parameterValues: parameterValues,
          isEditing: true,
        };
        setup(options);

        // show input by focusing the card
        await userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(
          screen.getByDisplayValue("Variable: {{variable}}"),
        ).toBeInTheDocument();
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
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        await userEvent.type(screen.getByRole("textbox"), "foo");
        await userEvent.tab();

        expect(mockOnUpdateVisualizationSettings).toHaveBeenCalledTimes(1);
        expect(mockOnUpdateVisualizationSettings).toHaveBeenCalledWith({
          text: "textfoo",
        });
      });
    });

    describe("editing parameter", () => {
      it("should show mapping UI if a card has variables", () => {
        setup({
          isEditing: true,
          isEditingParameter: true,
          dashcard: createMockHeadingDashboardCard({
            text: "Hello {{var}}",
            size_y: 6,
          }),
          settings: { text: "Hello {{var}}" },
        });

        expect(
          screen.getByTestId("parameter-mapper-container"),
        ).toBeInTheDocument();
      });

      it("should show an info message if a card doesn't have variables", () => {
        setup({
          isEditing: true,
          isEditingParameter: true,
          dashcard: createMockHeadingDashboardCard({
            text: "Hello",
            size_y: 6,
          }),
          settings: { text: "Hello" },
        });

        expect(
          screen.queryByTestId("parameter-mapper-container"),
        ).not.toBeInTheDocument();

        expect(
          screen.getByText(
            "You can connect widgets to {{ variables }} in heading cards.",
          ),
        ).toBeInTheDocument();
      });
    });
  });
});

function getSettingsWithText(text: string): Settings {
  return {
    text,
  };
}

function mapParameterToVariable({
  variableName,
  parameterValue,
}: {
  variableName: string;
  parameterValue: string | number;
}) {
  const parameter: Parameter = {
    id: "e7f8ca",
    name: "foo_bar",
    slug: "foo_bar",
    type: "text",
    value: parameterValue,
  };

  const parameter_mappings: DashboardParameterMapping[] = [
    {
      card_id: 1,
      parameter_id: parameter.id,
      target: buildTextTagTarget(variableName),
    },
  ];
  const parameters: Parameter[] = [parameter];
  const parameterValues = {
    [parameter.id]: parameter.value ?? null,
  };

  return { parameters, parameterValues, parameter_mappings };
}
