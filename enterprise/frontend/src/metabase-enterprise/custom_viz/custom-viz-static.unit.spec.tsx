import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
} from "custom-viz";
import ReactDOMServer from "react-dom/server";

import { mockSettings } from "__support__/settings";
import { CustomStaticVisualization } from "metabase/static-viz/components/StaticVisualization/CustomStaticVisualization";
import { getVisualization } from "metabase/visualizations";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import {
  createMockSingleSeries,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  applyCustomVizStaticOverride,
  customVizRegistry,
  registerCustomVizPlugin,
} from "./custom-viz-static";

type PluginSettings = Record<string, unknown>;
type StaticProps = CustomStaticVisualizationProps<PluginSettings>;

function makeFactory(
  StaticVisualizationComponent: (props: StaticProps) => JSX.Element,
): CreateCustomVisualization<PluginSettings> {
  return () => ({
    id: "test-viz",
    getName: () => "Test viz",
    checkRenderable: () => {},
    mount: () => ({ update: () => {}, unmount: () => {} }),
    VisualizationComponent: () => null,
    settings: {},
    StaticVisualizationComponent,
  });
}

const DemoViz = () => <svg data-testid="demo-viz" />;

describe("registerCustomVizPlugin", () => {
  afterEach(() => {
    customVizRegistry.clear();
  });

  it("registers the plugin's viz definition under its custom:* display", () => {
    registerCustomVizPlugin(makeFactory(DemoViz), "demo", 7);

    expect(
      customVizRegistry.get("custom:demo")?.StaticVisualizationComponent,
    ).toBe(DemoViz);
    expect(getVisualization("custom:demo")).toBe(DemoViz);
    expect(getVisualization("custom:demo")?.identifier).toBe("custom:demo");
  });

  it("calls the factory with the host's defineSetting and locale", () => {
    const factory = jest.fn(makeFactory(DemoViz));

    registerCustomVizPlugin(factory, "factory-props", 7);

    expect(factory).toHaveBeenCalledWith({
      defineSetting: expect.any(Function),
      locale: "en",
    });
  });

  it("re-registering an identifier serves the fresh definition, not the first-registered one", () => {
    const FirstViz = () => <svg data-testid="first" />;
    const SecondViz = () => <svg data-testid="second" />;

    registerCustomVizPlugin(makeFactory(FirstViz), "refresh", 7);
    registerCustomVizPlugin(makeFactory(SecondViz), "refresh", 7);

    expect(
      customVizRegistry.get("custom:refresh")?.StaticVisualizationComponent,
    ).toBe(SecondViz);
  });
});

describe("static rendering of a registered plugin", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ "custom-viz": true }),
    });
  });

  beforeEach(() => {
    applyCustomVizStaticOverride();
  });

  afterEach(() => {
    customVizRegistry.clear();
  });

  const hostRenderingContext: RenderingContext = {
    getColor: () => "#509ee3",
    measureText: () => 10,
    measureTextHeight: () => 12,
    fontFamily: "Lato",
    theme: DEFAULT_VISUALIZATION_THEME,
  };

  it("CustomStaticVisualization renders the plugin component with the series, computed settings, size, and rendering context", () => {
    let received: StaticProps | undefined;
    const ProbeViz = (props: StaticProps) => {
      received = props;
      return <svg data-testid="probe" />;
    };
    registerCustomVizPlugin(makeFactory(ProbeViz), "probe", 9);

    const rawSeries = [
      createMockSingleSeries(
        { display: "custom:probe" },
        { data: { rows: [[42]] } },
      ),
    ];

    expect(
      ReactDOMServer.renderToStaticMarkup(
        <CustomStaticVisualization
          rawSeries={rawSeries}
          renderingContext={hostRenderingContext}
          width={640}
          height={480}
        />,
      ).startsWith("<svg"),
    ).toBe(true);

    expect(received?.series).toBe(rawSeries);
    expect(received?.settings).toEqual(expect.any(Object));
    expect(received?.width).toBe(640);
    expect(received?.height).toBe(480);
    expect(received?.renderingContext).toEqual({
      getColor: hostRenderingContext.getColor,
      measureTextWidth: hostRenderingContext.measureText,
      measureTextHeight: hostRenderingContext.measureTextHeight,
      fontFamily: hostRenderingContext.fontFamily,
    });
  });
});
