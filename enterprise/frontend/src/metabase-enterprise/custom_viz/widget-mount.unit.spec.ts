import type { WidgetMount, WidgetMountHandle } from "custom-viz";

import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";
import { isFunction, isObject } from "metabase-types/guards";

import {
  getSettingWidgetDomId,
  getWidgetMountPlugin,
  isWidgetMount,
  wrapPluginWidget,
} from "./widget-mount";

const PLUGIN = createMockCustomVizPluginRuntime();
const PREFIX = "custom-viz:demo-viz:";

type WidgetProps = Record<string, unknown>;

function setup() {
  const handle: WidgetMountHandle<WidgetProps> = {
    update: jest.fn(),
    unmount: jest.fn(),
  };
  const pluginWidget = jest.fn<
    WidgetMountHandle<WidgetProps>,
    Parameters<WidgetMount>
  >(() => handle);
  const onChange = jest.fn();
  const onChangeSettings = jest.fn();

  const mount = wrapPluginWidget(pluginWidget, PLUGIN, PREFIX);
  const container = document.createElement("div");
  const mountHandle = mount(container, {
    id: `${PREFIX}threshold`,
    value: 1,
    onChange,
    onChangeSettings,
  });

  return {
    container,
    handle,
    mount,
    mountHandle,
    mountedProps: pluginWidget.mock.calls[0][1],
    onChange,
    onChangeSettings,
    pluginWidget,
  };
}

describe("wrapPluginWidget", () => {
  it("tags the mount with its plugin", () => {
    const { mount } = setup();

    expect(isWidgetMount(mount)).toBe(true);
    expect(getWidgetMountPlugin(mount)).toBe(PLUGIN);
  });

  it("mounts into the container with the plugin's own setting id", () => {
    const { container, mountedProps, pluginWidget } = setup();

    expect(pluginWidget).toHaveBeenCalledWith(container, mountedProps);
    expect(mountedProps).toMatchObject({ id: "threshold", value: 1 });
  });

  it("forwards only the value to onChange", () => {
    const { mountedProps, onChange } = setup();

    getCallback(mountedProps, "onChange")(2, { forged: "question" });

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("namespaces every key written through onChangeSettings", () => {
    const { mountedProps, onChangeSettings } = setup();

    getCallback(mountedProps, "onChangeSettings")(
      {
        threshold: 2,
        "gauge.segments": [{ min: { type: "card", id: 1, column: "x" } }],
      },
      { forged: "question" },
    );

    expect(onChangeSettings).toHaveBeenCalledWith({
      [`${PREFIX}threshold`]: 2,
      [`${PREFIX}gauge.segments`]: [
        { min: { type: "card", id: 1, column: "x" } },
      ],
    });
  });

  it.each([null, undefined, "threshold", 42, true])(
    "turns the non-object payload %p into an empty update",
    (payload) => {
      const { mountedProps, onChangeSettings } = setup();

      getCallback(mountedProps, "onChangeSettings")(payload);

      expect(onChangeSettings).toHaveBeenCalledWith({});
    },
  );

  it("translates the props passed through update", () => {
    const { handle, mountHandle } = setup();
    const onChangeSettings = jest.fn();

    mountHandle.update({
      id: `${PREFIX}threshold`,
      value: 2,
      onChange: jest.fn(),
      onChangeSettings,
    });

    expect(handle.update).toHaveBeenCalledTimes(1);
    const updatedProps = jest.mocked(handle.update).mock.calls[0][0];
    expect(updatedProps).toMatchObject({ id: "threshold", value: 2 });

    getCallback(updatedProps, "onChangeSettings")({ threshold: 3 });
    expect(onChangeSettings).toHaveBeenCalledWith({
      [`${PREFIX}threshold`]: 3,
    });
  });

  it("clones the value so a widget can't mutate host state in place", () => {
    const handle: WidgetMountHandle<WidgetProps> = {
      update: jest.fn(),
      unmount: jest.fn(),
    };
    const pluginWidget = jest.fn<
      WidgetMountHandle<WidgetProps>,
      Parameters<WidgetMount>
    >(() => handle);
    const hostValue = { min: 1 };

    wrapPluginWidget(
      pluginWidget,
      PLUGIN,
      PREFIX,
    )(document.createElement("div"), {
      id: `${PREFIX}threshold`,
      value: hostValue,
      onChange: jest.fn(),
      onChangeSettings: jest.fn(),
    });

    const mountedValue = pluginWidget.mock.calls[0][1].value;

    if (!isObject(mountedValue)) {
      throw new Error("Expected the widget to receive the object value");
    }

    mountedValue.min = 99;

    expect(hostValue.min).toBe(1);
  });

  it("mounts without a value", () => {
    const pluginWidget = jest.fn<
      WidgetMountHandle<WidgetProps>,
      Parameters<WidgetMount>
    >(() => ({ update: jest.fn(), unmount: jest.fn() }));

    wrapPluginWidget(
      pluginWidget,
      PLUGIN,
      PREFIX,
    )(document.createElement("div"), {
      id: `${PREFIX}threshold`,
      value: undefined,
      onChange: jest.fn(),
      onChangeSettings: jest.fn(),
    });

    expect(pluginWidget.mock.calls[0][1].value).toBeUndefined();
  });

  it("delegates unmount", () => {
    const { handle, mountHandle } = setup();

    mountHandle.unmount();

    expect(handle.unmount).toHaveBeenCalledTimes(1);
  });
});

describe("getSettingWidgetDomId", () => {
  it("strips the prefix for a plugin mount", () => {
    const { mount } = setup();

    expect(getSettingWidgetDomId(mount, `${PREFIX}threshold`)).toBe(
      "threshold",
    );
  });

  it("returns the id unchanged for anything else", () => {
    expect(getSettingWidgetDomId("input", `${PREFIX}threshold`)).toBe(
      `${PREFIX}threshold`,
    );
    expect(getSettingWidgetDomId(() => null, "threshold")).toBe("threshold");
  });
});

function getCallback(props: WidgetProps, name: string) {
  const callback = props[name];

  if (!isFunction(callback)) {
    throw new Error(`Expected "${name}" to be a function`);
  }

  return callback;
}
