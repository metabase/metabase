import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockDashboard,
  createMockEmbedDashboardCard,
} from "metabase-types/api/mocks";

import { EmbedViz, type EmbedVizProps } from "./EmbedViz";

registerVisualizations();

const embedDashcard = createMockEmbedDashboardCard({
  visualization_settings: {
    embed: "<iframe src='https://example.com'></iframe>",
  },
});

const emptyEmbedDashcard = createMockEmbedDashboardCard({
  visualization_settings: {
    embed: "",
  },
});

const setup = (options?: Partial<EmbedVizProps>) => {
  const changeSpy = jest.fn();
  const togglePreviewingSpy = jest.fn();

  renderWithProviders(
    <EmbedViz
      dashcard={embedDashcard}
      dashboard={createMockDashboard()}
      isEditing={true}
      isPreviewing={false}
      onUpdateVisualizationSettings={changeSpy}
      settings={embedDashcard.visualization_settings as VisualizationSettings}
      width={800}
      height={600}
      gridSize={{ width: 18, height: 6 }}
      onTogglePreviewing={togglePreviewingSpy}
      {...options}
    />,
  );

  return { changeSpy, togglePreviewingSpy };
};

describe("EmbedViz", () => {
  it("should render embed input in editing mode", () => {
    setup({ isEditing: true });

    expect(screen.getByTestId("embed-card-input")).toBeInTheDocument();
    expect(screen.getByTestId("embed-card-input")).toHaveValue(
      "<iframe src='https://example.com'></iframe>",
    );
  });

  it("updates visualization settings with input value", () => {
    const { changeSpy } = setup({ isEditing: true });

    const embedInput = screen.getByTestId("embed-card-input");
    fireEvent.change(embedInput, {
      target: { value: "<iframe src='https://newexample.com'></iframe>" },
    });

    expect(changeSpy).toHaveBeenCalledWith({
      embed: "<iframe src='https://newexample.com'></iframe>",
    });
  });

  it("should disable 'Done' button when embed is empty", () => {
    setup({
      isEditing: true,
      dashcard: emptyEmbedDashcard,
      settings: emptyEmbedDashcard.visualization_settings,
    });

    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("should enable 'Done' button when embed is not empty", () => {
    setup({ isEditing: true });

    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("should call onTogglePreviewing when 'Done' is clicked", async () => {
    const { togglePreviewingSpy } = setup({ isEditing: true });

    await userEvent.click(screen.getByText("Done"));

    expect(togglePreviewingSpy).toHaveBeenCalled();
  });

  it("should render embedded content in preview mode", () => {
    setup({ isEditing: false, isPreviewing: true });

    const embedWrapper = screen.getByTestId("embed-card");
    expect(embedWrapper).toBeInTheDocument();
    expect(embedWrapper.innerHTML).toContain(
      '<iframe src="https://example.com" width="800" height="600" frameborder="0"></iframe>',
    );
  });
});
