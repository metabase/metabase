import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { Parameter, VisualizationSettings } from "metabase-types/api";
import {
  createMockDashboard,
  createMockIFrameDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockSettingsState,
} from "metabase-types/store/mocks";

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

const setup = (
  options?: Partial<IFrameVizProps> & {
    parameterValues?: Record<string, string>;
  },
) => {
  const onUpdateVisualizationSettings = jest.fn();
  const onTogglePreviewing = jest.fn();

  const dashboard = options?.dashboard ?? createMockDashboard();
  const dashcard = options?.dashcard ?? iframeDashcard;

  renderWithProviders(
    <IFrameViz
      dashcard={dashcard}
      dashboard={dashboard}
      isEditing={true}
      isPreviewing={false}
      onUpdateVisualizationSettings={onUpdateVisualizationSettings}
      settings={dashcard.visualization_settings as VisualizationSettings}
      width={800}
      height={600}
      gridSize={{ width: 18, height: 6 }}
      onTogglePreviewing={onTogglePreviewing}
      {...options}
    />,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: {
              ...dashboard,
              dashcards: [dashcard.id],
            },
          },
          dashcards: {
            [dashcard.id]: dashcard,
          },
          parameterValues:
            dashboard.parameters?.reduce(
              (acc, param) => ({
                ...acc,
                [param.id]: options?.parameterValues?.[param.slug] ?? "",
              }),
              {},
            ) ?? {},
        }),
      },
    },
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

  describe("parameters", () => {
    const setupParameterTest = ({
      parameters,
      iframeContent,
      parameterValues,
      allowedHosts = "*",
    }: {
      parameters: Parameter[];
      iframeContent: string;
      parameterValues?: Record<string, string>;
      allowedHosts?: string;
    }) => {
      const dashboard = createMockDashboard({
        parameters,
      });

      const dashcard = createMockIFrameDashboardCard({
        dashboard_id: dashboard.id,
        visualization_settings: { iframe: iframeContent },
        parameter_mappings: parameters.map(param => ({
          parameter_id: param.id,
          target: ["text-tag", param.slug],
        })),
      });

      renderWithProviders(
        <IFrameViz
          dashcard={dashcard}
          dashboard={dashboard}
          isEditing={false}
          isPreviewing={true}
          onUpdateVisualizationSettings={jest.fn()}
          settings={{ iframe: iframeContent }}
          width={800}
          height={600}
          gridSize={{ width: 18, height: 6 }}
          onTogglePreviewing={jest.fn()}
        />,
        {
          storeInitialState: {
            settings: createMockSettingsState(
              allowedHosts
                ? {
                    "allowed-iframe-hosts": allowedHosts,
                  }
                : {},
            ),
            dashboard: createMockDashboardState({
              dashboardId: dashboard.id,
              dashboards: {
                [dashboard.id]: {
                  ...dashboard,
                  dashcards: [dashcard.id],
                },
              },
              dashcards: {
                [dashcard.id]: dashcard,
              },
              parameterValues:
                dashboard.parameters?.reduce(
                  (acc, param) => ({
                    ...acc,
                    [param.id]: parameterValues?.[param.slug] ?? "",
                  }),
                  {},
                ) ?? {},
            }),
          },
        },
      );

      return screen.queryByTestId("iframe-visualization");
    };

    it("should substitute parameter values", () => {
      const parameters = [
        createMockParameter({
          id: "1",
          name: "Parameter 1",
          slug: "param1",
        }),
        createMockParameter({
          id: "2",
          name: "Parameter 2",
          slug: "param2",
        }),
      ];

      const iframe = setupParameterTest({
        parameters,
        iframeContent: "https://example.com/{{param1}}?q={{param2}}",
        parameterValues: { param1: "foo", param2: "bar" },
      });

      expect(iframe).toHaveAttribute("src", "https://example.com/foo?q=bar");
    });

    it("should preserve iframe attributes when substituting parameters", () => {
      const parameter = createMockParameter({
        id: "1",
        name: "Test Parameter",
        slug: "test_parameter",
      });

      const iframe = setupParameterTest({
        parameters: [parameter],
        iframeContent:
          '<iframe src="https://example.com/{{test_parameter}}" allow="camera; microphone" allowfullscreen="true"></iframe>',
        parameterValues: { test_parameter: "123" },
      });

      expect(iframe).toHaveAttribute("src", "https://example.com/123");
      expect(iframe).toHaveAttribute("allow", "camera; microphone");
      expect(iframe).toHaveAttribute("allowfullscreen", "true");
    });

    it("should render iframe when parameter value points to an allowed domain", () => {
      const parameter = createMockParameter({
        id: "1",
        name: "Test Parameter",
        slug: "test_parameter",
      });

      const iframe = setupParameterTest({
        parameters: [parameter],
        iframeContent: "https://{{test_parameter}}/page",
        parameterValues: { test_parameter: "trusted.com" },
        allowedHosts: "trusted.com",
      });

      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "https://trusted.com/page");
    });

    it("should not render iframe when parameter value points to a forbidden domain", () => {
      const parameter = createMockParameter({
        id: "1",
        name: "Test Parameter",
        slug: "test_parameter",
      });

      const iframe = setupParameterTest({
        parameters: [parameter],
        iframeContent: "https://{{test_parameter}}/page",
        parameterValues: { test_parameter: "evil.com" },
        allowedHosts: "trusted.com",
      });

      expect(iframe).not.toBeInTheDocument();
      expect(
        screen.getByText("There was a problem rendering this content."),
      ).toBeInTheDocument();
    });
  });
});
