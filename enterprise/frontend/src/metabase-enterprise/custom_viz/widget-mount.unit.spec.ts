import type { WidgetMount, WidgetMountHandle } from "custom-viz";

import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";
import { isFunction } from "metabase-types/guards";

import {
  getWidgetMountPlugin,
  isWidgetMount,
  wrapPluginWidget,
} from "./widget-mount";

const PLUGIN = createMockCustomVizPluginRuntime({
  display_name: "Example viz",
});
const ALLOWED_WRITE_KEYS = new Set(["threshold", "card.title"]);

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
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  const mount = wrapPluginWidget(pluginWidget, PLUGIN, ALLOWED_WRITE_KEYS);
  const container = document.createElement("div");
  const mountHandle = mount(container, {
    id: "threshold",
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
    warn,
  };
}

function getCallback(props: WidgetProps, name: string) {
  const callback = props[name];
  if (!isFunction(callback)) {
    throw new Error(`Expected "${name}" to be a function`);
  }

  return callback;
}

describe("wrapPluginWidget", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tags the mount with its plugin", () => {
    const { mount } = setup();

    expect(isWidgetMount(mount)).toBe(true);
    expect(getWidgetMountPlugin(mount)).toBe(PLUGIN);
  });

  it("mounts into the container with the non-callback props intact", () => {
    const { container, mountedProps, pluginWidget } = setup();

    expect(pluginWidget).toHaveBeenCalledWith(container, mountedProps);
    expect(mountedProps).toMatchObject({ id: "threshold", value: 1 });
  });

  it("forwards only the value to onChange", () => {
    const { mountedProps, onChange } = setup();

    getCallback(mountedProps, "onChange")(2, { forged: "question" });

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("forwards only writable settings to onChangeSettings and warns about the rest", () => {
    const { mountedProps, onChangeSettings, warn } = setup();

    getCallback(mountedProps, "onChangeSettings")(
      {
        threshold: 2,
        "card.title": "Title",
        "gauge.segments": [{ min: { type: "card", id: 1, column: "x" } }],
        "graph.goal_value": { type: "card", id: 1, column: "x" },
      },
      { forged: "question" },
    );

    expect(onChangeSettings).toHaveBeenCalledWith({
      threshold: 2,
      "card.title": "Title",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Custom viz "Example viz" tried to write settings it does not own and they were ignored: gauge.segments, graph.goal_value.',
    );
  });

  it("does not warn when every written setting is writable", () => {
    const { mountedProps, onChangeSettings, warn } = setup();

    getCallback(mountedProps, "onChangeSettings")({ threshold: 2 });

    expect(onChangeSettings).toHaveBeenCalledWith({ threshold: 2 });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "threshold", 42, true])(
    "turns the non-object payload %p into an empty update",
    (payload) => {
      const { mountedProps, onChangeSettings } = setup();

      getCallback(mountedProps, "onChangeSettings")(payload);

      expect(onChangeSettings).toHaveBeenCalledWith({});
    },
  );

  it("guards the props passed through update", () => {
    const { handle, mountHandle } = setup();
    const onChangeSettings = jest.fn();

    mountHandle.update({ id: "threshold", value: 2, onChangeSettings });

    expect(handle.update).toHaveBeenCalledTimes(1);
    const updatedProps = jest.mocked(handle.update).mock.calls[0][0];
    expect(updatedProps).toMatchObject({ id: "threshold", value: 2 });
    expect(updatedProps.onChangeSettings).not.toBe(onChangeSettings);

    getCallback(
      updatedProps,
      "onChangeSettings",
    )({
      threshold: 3,
      "scalar.segments": [],
    });
    expect(onChangeSettings).toHaveBeenCalledWith({ threshold: 3 });
  });

  it("delegates unmount", () => {
    const { handle, mountHandle } = setup();

    mountHandle.unmount();

    expect(handle.unmount).toHaveBeenCalledTimes(1);
  });
});
