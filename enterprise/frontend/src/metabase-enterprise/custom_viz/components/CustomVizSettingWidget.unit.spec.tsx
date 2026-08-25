import { render, screen, waitFor } from "@testing-library/react";
import type { WidgetMount } from "custom-viz";
import { type ComponentType, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";

import { wrapPluginWidget } from "../widget-mount";

import { CustomVizSettingWidget } from "./CustomVizSettingWidget";

type TestWidgetProps = {
  title?: string;
  value?: number;
  onChangeSettings?: (settings: Record<string, unknown>) => void;
};

const WRITTEN_SETTINGS = {
  value: 2,
  "gauge.segments": [{ min: { type: "card", id: 1, column: "count" } }],
};

function TestWidget({ title, onChangeSettings }: TestWidgetProps) {
  useEffect(() => {
    onChangeSettings?.(WRITTEN_SETTINGS);
  }, [onChangeSettings]);

  return (
    <div data-testid="plugin-widget">
      <h1>{title}</h1>
    </div>
  );
}

/** Plugin mount that mirrors SDK `defineConfig` widget lifecycle. */
function makePluginWidgetMount(
  Widget: ComponentType<TestWidgetProps>,
): WidgetMount<TestWidgetProps> {
  return (container, initialProps) => {
    const root = createRoot(container);
    const renderWidget = (props: TestWidgetProps) => {
      root.render(<Widget {...props} />);
    };

    renderWidget(initialProps);

    return {
      update: renderWidget,
      unmount: () => root.unmount(),
    };
  };
}

function prepareWidget(pluginId = 1) {
  let mountCalls = 0;
  let widgetContainer: Element | null = null;
  const pluginMount = makePluginWidgetMount(TestWidget);
  const widgetMount: WidgetMount<TestWidgetProps> = (
    container,
    initialProps,
  ) => {
    mountCalls += 1;
    widgetContainer = container;
    return pluginMount(container, initialProps);
  };
  const mount = wrapPluginWidget(
    widgetMount,
    createMockCustomVizPluginRuntime({ id: pluginId }),
    new Set(["value"]),
  );
  return {
    mount,
    getMountCalls: () => mountCalls,
    getWidgetContainer: () => widgetContainer,
  };
}

function setup({
  pluginId = 1,
  widgetProps = { title: "Setting 1" },
}: {
  widgetProps?: TestWidgetProps;
  pluginId?: number;
}) {
  const { mount, getMountCalls, getWidgetContainer } = prepareWidget(pluginId);

  const { rerender, unmount } = render(
    <CustomVizSettingWidget mount={mount} widgetProps={widgetProps} />,
  );

  return {
    getMountCalls,
    mount,
    rerender,
    unmount,
    getWidgetContainer,
  };
}

describe("CustomVizSettingWidget", () => {
  it("calls mount once with the container element and initial props", () => {
    const { getMountCalls } = setup({});

    expect(getMountCalls()).toBe(1);
    expect(
      screen.getByRole("heading", { name: "Setting 1" }),
    ).toBeInTheDocument();
  });

  it("calls update (not mount again) on prop change", () => {
    const { rerender, mount, getMountCalls } = setup({});

    rerender(
      <CustomVizSettingWidget
        mount={mount}
        widgetProps={{ title: "Settings 2" }}
      />,
    );

    expect(getMountCalls()).toBe(1);
    expect(
      screen.getByRole("heading", { name: "Settings 2" }),
    ).toBeInTheDocument();
  });

  it("properly tears down the widget", () => {
    const { unmount } = setup({});

    expect(
      screen.getByRole("heading", { name: "Setting 1" }),
    ).toBeInTheDocument();

    unmount();

    expect(
      screen.queryByRole("heading", { name: "Setting 1" }),
    ).not.toBeInTheDocument();
  });

  it("stamps data-plugin-sandbox with the pluginId carried by the trusted mount", async () => {
    const { getWidgetContainer } = setup({ pluginId: 11 });

    await waitFor(() => {
      expect(getWidgetContainer()).toHaveAttribute("data-plugin-sandbox", "11");
    });
  });

  it("lets the widget write only the plugin's own settings", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const onChangeSettings = jest.fn();

    setup({ widgetProps: { title: "Setting 1", onChangeSettings } });

    await waitFor(() => {
      expect(onChangeSettings).toHaveBeenCalledWith({ value: 2 });
    });
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
