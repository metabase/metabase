import { render } from "@testing-library/react";

import { wrapPluginWidget } from "../widget-mount";

import { CustomVizSettingWidget } from "./CustomVizSettingWidget";

// Build the mount via `wrapPluginWidget` so the host-realm trust marker
// and pluginId are stamped — the driver recovers pluginId from the mount
// itself rather than receiving it as a prop. Assertions target `inner`,
// the underlying plugin function the trusted wrapper forwards to.
const makeMount = (pluginId = 1) => {
  const handle = {
    update: jest.fn(),
    unmount: jest.fn(),
  };
  const inner = jest.fn().mockReturnValue(handle);
  const mount = wrapPluginWidget(inner as never, pluginId);
  return { mount, inner, handle };
};

describe("CustomVizSettingWidget", () => {
  it("calls mount once with the container element and initial props", () => {
    const { mount, inner } = makeMount();
    render(
      <CustomVizSettingWidget mount={mount} widgetProps={{ id: "x", v: 1 }} />,
    );

    expect(inner).toHaveBeenCalledTimes(1);
    const [arg0, arg1] = inner.mock.calls[0];
    expect(arg0).toBeInstanceOf(HTMLDivElement);
    expect((arg0 as HTMLElement).isConnected).toBe(true);
    expect(arg1).toEqual({ id: "x", v: 1 });
  });

  it("calls update (not mount again) on prop change", () => {
    const { mount, inner, handle } = makeMount();
    const { rerender } = render(
      <CustomVizSettingWidget mount={mount} widgetProps={{ id: "x", v: 1 }} />,
    );

    rerender(
      <CustomVizSettingWidget mount={mount} widgetProps={{ id: "x", v: 2 }} />,
    );

    expect(inner).toHaveBeenCalledTimes(1);
    expect(handle.update).toHaveBeenCalledTimes(1);
    expect(handle.update).toHaveBeenLastCalledWith({ id: "x", v: 2 });
  });

  it("calls unmount on teardown", () => {
    const { mount, handle } = makeMount();
    const { unmount } = render(
      <CustomVizSettingWidget mount={mount} widgetProps={{ id: "x" }} />,
    );

    unmount();

    expect(handle.unmount).toHaveBeenCalledTimes(1);
  });

  it("re-mounts cleanly after teardown", () => {
    const first = makeMount();
    const { unmount } = render(
      <CustomVizSettingWidget mount={first.mount} widgetProps={{ id: "x" }} />,
    );
    unmount();

    // A logically-new instance (e.g. user navigates away and back) should
    // produce a fresh mount call against a fresh container.
    const second = makeMount();
    render(
      <CustomVizSettingWidget mount={second.mount} widgetProps={{ id: "y" }} />,
    );

    expect(second.inner).toHaveBeenCalledTimes(1);
    expect(first.handle.update).not.toHaveBeenCalled();
  });

  it("stamps data-plugin-sandbox with the pluginId carried by the trusted mount", () => {
    // The container must carry the same `data-plugin-sandbox` attribute
    // the main-viz wrapper uses; otherwise the sandbox's DOM-scoping
    // distortion swaps the container with a detached decoy and the
    // widget's React tree never reaches the page.
    const { mount, inner } = makeMount(42);
    render(<CustomVizSettingWidget mount={mount} widgetProps={{}} />);

    const [arg0] = inner.mock.calls[0];
    expect(arg0 as HTMLElement).toHaveAttribute("data-plugin-sandbox", "42");
  });
});
