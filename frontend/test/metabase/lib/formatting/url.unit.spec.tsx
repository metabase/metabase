import { render, screen } from "__support__/ui";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import { formatUrl } from "metabase/lib/formatting/url";

describe("formatUrl", () => {
  afterEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    jest.restoreAllMocks();
  });

  it("calls handleLinkSdkPlugin and prevents default in SDK", async () => {
    await mockIsEmbeddingSdk(true);

    const url = "https://example.com/dashboard/1";
    const handleLink = jest.fn().mockReturnValue({ handled: true });

    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const node = formatUrl(url, { jsx: true, rich: true, view_as: "link" });
    render(node as unknown as JSX.Element);

    const link = screen.getByRole("link");
    // Manually creating the event instead of using fireEvent.click because we need to inspect
    // the defaultPrevented property of the event.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not call handleLinkSdkPlugin in core app", async () => {
    await mockIsEmbeddingSdk(false);

    const url = "https://example.com/dashboard/2";
    const handleLink = jest.fn();

    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const node = formatUrl(url, { jsx: true, rich: true, view_as: "link" });
    render(node as unknown as JSX.Element);

    const link = screen.getByRole("link");
    // Manually creating the event instead of using fireEvent.click because we need to inspect
    // the defaultPrevented property of the event.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(handleLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
