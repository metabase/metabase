import { render, screen } from "@testing-library/react";

import { createMockDashboardCardWithVirtualCard } from "metabase-types/api/mocks";
import type {
  BaseDashboardOrderedCard,
  VisualizationSettings,
} from "metabase-types/api";

import { Heading } from "../Heading";

interface Settings {
  text: string;
}

interface Options {
  dashcard?: BaseDashboardOrderedCard;
  isEditing?: boolean;
  onUpdateVisualizationSettings?: ({ text }: { text: string }) => void;
  settings?: VisualizationSettings;
}

const defaultProps = {
  dashcard: createMockDashboardCardWithVirtualCard(),
  isEditing: false,
  onUpdateVisualizationSettings: () => {
    return;
  },
  settings: { text: "" },
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
  });

  describe("Editing Dashboard", () => {
    describe("Preview/Unfocused", () => {
      it("should preview with placeholder when it has no content", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        expect(
          screen.getByTestId("editing-dashboard-heading-preview"),
        ).toHaveTextContent("Heading");
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
    });

    describe("Edit/Focused", () => {
      it("should focus input when clicked", () => {
        const options = {
          settings: getSettingsWithText(""),
          isEditing: true,
        };
        setup(options);

        screen.getByTestId("editing-dashboard-heading-preview").click();
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

        screen.getByTestId("editing-dashboard-heading-preview").click();
        expect(screen.getByPlaceholderText("Heading")).toBeInTheDocument();
      });

      it("should render input text when it has content", () => {
        const options = {
          settings: getSettingsWithText("Example Heading"),
          isEditing: true,
        };
        setup(options);

        screen.getByTestId("editing-dashboard-heading-preview").click();
        expect(screen.getByDisplayValue("Example Heading")).toBeInTheDocument();
      });
    });
  });
});

function getSettingsWithText(text: string): Settings {
  return {
    text,
  };
}
