import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockDashboard,
  createMockIFrameDashboardCard,
} from "metabase-types/api/mocks";

import { IFrameViz, type IFrameVizProps } from "./IFrameViz";

registerVisualizations();

const iframeDashcard = createMockIFrameDashboardCard({
  visualization_settings: {
    iframe: "<iframe src='https://example.com'></iframe>",
  },
});

const emptyIFrameDashcard = createMockIFrameDashboardCard({
  visualization_settings: {
    iframe: "",
  },
});

const setup = (options?: Partial<IFrameVizProps>) => {
  const onUpdateVisualizationSettings = jest.fn();
  const onTogglePreviewing = jest.fn();

  renderWithProviders(
    <IFrameViz
      dashcard={iframeDashcard}
      dashboard={createMockDashboard()}
      isEditing={true}
      isPreviewing={false}
      onUpdateVisualizationSettings={onUpdateVisualizationSettings}
      settings={iframeDashcard.visualization_settings as VisualizationSettings}
      width={800}
      height={600}
      gridSize={{ width: 18, height: 6 }}
      onTogglePreviewing={onTogglePreviewing}
      {...options}
    />,
  );

  return { onUpdateVisualizationSettings, onTogglePreviewing };
};

describe("IFrameViz", () => {
  it("should add sandbox attribute to iframe", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: { iframe: "https://example.com" },
    });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts",
    );
    expect(iframe).toHaveAttribute(
      "referrerPolicy",
      "strict-origin-when-cross-origin",
    );
  });

  it("should render iframe input in editing mode", () => {
    setup({ isEditing: true });

    expect(screen.getByTestId("iframe-card-input")).toBeInTheDocument();
    expect(screen.getByTestId("iframe-card-input")).toHaveValue(
      "<iframe src='https://example.com'></iframe>",
    );
  });

  it("updates visualization settings with input value", () => {
    const { onUpdateVisualizationSettings } = setup({ isEditing: true });

    const iframeInput = screen.getByTestId("iframe-card-input");
    fireEvent.change(iframeInput, {
      target: { value: "<iframe src='https://newexample.com'></iframe>" },
    });

    expect(onUpdateVisualizationSettings).toHaveBeenCalledWith({
      iframe: "<iframe src='https://newexample.com'></iframe>",
    });
  });

  it("should not disable 'Done' button when iframe is empty so users can quit editing", () => {
    setup({
      isEditing: true,
      dashcard: emptyIFrameDashcard,
      settings: emptyIFrameDashcard.visualization_settings,
    });

    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("should enable 'Done' button when iframe is not empty", () => {
    setup({ isEditing: true });

    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("should call onTogglePreviewing when 'Done' is clicked", async () => {
    const { onTogglePreviewing } = setup({ isEditing: true });

    await userEvent.click(screen.getByText("Done"));

    expect(onTogglePreviewing).toHaveBeenCalled();
  });

  it("should render embedded content in preview mode", () => {
    setup({ isEditing: false, isPreviewing: true });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toHaveAttribute("src", "https://example.com");
    expect(iframe).toHaveAttribute("width", "800");
  });

  it("should transform YouTube share link to embed link in preview mode", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: { iframe: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("should transform Loom share link to embed link in preview mode", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: { iframe: "https://www.loom.com/share/1234567890abcdef" },
    });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.loom.com/embed/1234567890abcdef",
    );
  });

  it("should preserve allow and allowfullscreen attributes from iframe", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: {
        iframe:
          "<iframe src='https://example.com' allow='camera; microphone' allowfullscreen='true'></iframe>",
      },
    });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toHaveAttribute("src", "https://example.com");
    expect(iframe).toHaveAttribute("allow", "camera; microphone");
    expect(iframe).toHaveAttribute("allowfullscreen", "true");
  });

  it("should not render iframe for unsafe URLs", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: { iframe: "javascript:alert('XSS')" },
    });

    expect(
      screen.queryByTestId("iframe-visualization"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("There was a problem rendering this content."),
    ).toBeInTheDocument();
  });

  it("should sanitize iframe with onload attribute while preserving allowed attributes", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: {
        iframe:
          "<iframe src='https://example.com' allow='camera' allowfullscreen='true' onload=\"alert('XSS')\"></iframe>",
      },
    });

    const iframe = screen.getByTestId("iframe-visualization");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", "https://example.com");
    expect(iframe).toHaveAttribute("allow", "camera");
    expect(iframe).toHaveAttribute("allowfullscreen", "true");
    expect(iframe).not.toHaveAttribute("onload");
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts",
    );
    expect(iframe).toHaveAttribute(
      "referrerPolicy",
      "strict-origin-when-cross-origin",
    );
  });

  it("should display error message when iframe URL is empty", () => {
    setup({
      isEditing: false,
      isPreviewing: true,
      settings: { iframe: "" },
    });

    expect(
      screen.queryByTestId("iframe-visualization"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("There was a problem rendering this content."),
    ).toBeInTheDocument();
  });
});
