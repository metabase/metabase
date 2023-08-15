import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { color } from "metabase/lib/colors";

import {
  createMockDashboard,
  createMockDashboardOrderedCard,
} from "metabase-types/api/mocks";
import type {
  DashboardOrderedCard,
  Dashboard,
  ParameterId,
  Parameter,
  ParameterValueOrArray,
  VisualizationSettings,
  DashboardParameterMapping,
} from "metabase-types/api";
import { buildTextTagTarget } from "metabase-lib/parameters/utils/targets";

import { Heading } from "../Heading";

interface Settings {
  text: string;
}

interface Options {
  dashcard?: DashboardOrderedCard;
  isEditing?: boolean;
  isEditingParameter?: boolean;
  onUpdateVisualizationSettings?: ({ text }: { text: string }) => void;
  settings?: VisualizationSettings;
  dashboard?: Dashboard;
  parameterValues?: Record<ParameterId, ParameterValueOrArray>;
}

const defaultProps = {
  dashcard: createMockDashboardOrderedCard(),
  dashboard: createMockDashboard(),
  isEditing: false,
  isEditingParameter: false,
  onUpdateVisualizationSettings: () => {
    return;
  },
  settings: { text: "" },
  parameterValues: {},
};

const setup = (options: Options) => {
  render(<Heading {...defaultProps} {...options} />);
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
      const variableName = "variable";
      const text = `Variable: {{${variableName}}}`;

      const parameterValue = 15;

      const { parameters, parameterValues, parameter_mappings } =
        mapParameterToVariable({ variableName, parameterValue });

      const options = {
        settings: getSettingsWithText(text),
        dashcard: createMockDashboardOrderedCard({ parameter_mappings }),
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
        ).toHaveTextContent("Heading");
        expect(screen.getByTestId("editing-dashboard-heading-container"))
          .toHaveStyle(`border: 1px solid ${color("brand")};
                        color: ${color("text-light")};`);
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
          dashcard: createMockDashboardOrderedCard({ parameter_mappings }),
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
      it("should display and focus input when clicked", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(
          screen.getByTestId("editing-dashboard-heading-input"),
        ).toHaveFocus();
      });

      it("should have input placeholder when it has no content", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(screen.getByPlaceholderText("Heading")).toBeInTheDocument();
      });

      it("should render input text when it has content", () => {
        const options = {
          settings: getSettingsWithText("Example Heading"),
          isEditing: true,
        };
        setup(options);

        userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(screen.getByDisplayValue("Example Heading")).toBeInTheDocument();
      });

      it("should show input without replacing mapped variables with parameter values", () => {
        const variableName = "variable";
        const text = `Variable: {{${variableName}}}`;

        const parameterValue = 15;

        const { parameters, parameterValues, parameter_mappings } =
          mapParameterToVariable({ variableName, parameterValue });

        const options = {
          settings: getSettingsWithText(text),
          dashcard: createMockDashboardOrderedCard({ parameter_mappings }),
          dashboard: createMockDashboard({ parameters }),
          parameterValues: parameterValues,
          isEditing: true,
        };
        setup(options);

        // show input by focusing the card
        userEvent.click(
          screen.getByTestId("editing-dashboard-heading-preview"),
        );
        expect(
          screen.getByDisplayValue("Variable: {{variable}}"),
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
    name: "foo bar",
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
  const parameterValues: Record<ParameterId, ParameterValueOrArray> = {
    [parameter.id]: parameter.value,
  };

  return { parameters, parameterValues, parameter_mappings };
}
