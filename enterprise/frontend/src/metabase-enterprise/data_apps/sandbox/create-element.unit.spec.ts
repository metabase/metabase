import {
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
} from "metabase/utils/scripts-sandbox/distortions-dom-mutate";

import { makeCreateElementDistortion } from "./create-element";

// In production `shared` is the custom-viz sandbox distortion callback
// (`makeSandboxDistortionCallback` from `metabase/utils/scripts-sandbox`) — the
// same dangerous-tag blocklist custom-viz uses. Here it's stubbed so these tests
// assert the delegation contract (non-<style> tags fall back to `shared`, with
// the tag/options forwarded and its result returned); the blocklist behaviour
// itself is covered by scripts-sandbox's own tests.
const setup = (sentinel?: unknown) => {
  const sharedImpl = jest.fn(() => sentinel);
  const shared = jest.fn(() => sharedImpl);

  return { shared, sharedImpl };
};

describe("makeCreateElementDistortion", () => {
  it("returns null for values that aren't createElement / createElementNS", () => {
    const { shared } = setup();

    expect(makeCreateElementDistortion({}, shared)).toBeNull();
    expect(shared).not.toHaveBeenCalled();
  });

  describe("createElement", () => {
    it("allows <style> through the native creator (bundled CSS injection)", () => {
      const { shared, sharedImpl } = setup();
      const create = makeCreateElementDistortion(CREATE_ELEMENT, shared);

      const el = create.call(document, "style");

      expect(el).toBeInstanceOf(HTMLStyleElement);
      expect(sharedImpl).not.toHaveBeenCalled();
    });

    it("delegates non-style tags to the shared (blocklisted) creator", () => {
      const sentinel = document.createElement("div");
      const { shared, sharedImpl } = setup(sentinel);
      const create = makeCreateElementDistortion(CREATE_ELEMENT, shared);

      const options = { is: "custom-el" };
      const el = create.call(document, "script", options);

      expect(shared).toHaveBeenCalledWith(CREATE_ELEMENT);
      expect(sharedImpl).toHaveBeenCalledWith("script", options);
      expect(el).toBe(sentinel);
    });
  });

  describe("createElementNS", () => {
    it("allows namespaced <style> through the native creator", () => {
      const { shared, sharedImpl } = setup();
      const create = makeCreateElementDistortion(CREATE_ELEMENT_NS, shared);

      const el = create.call(
        document,
        "http://www.w3.org/1999/xhtml",
        "html:style",
      );

      expect(el).toBeInstanceOf(HTMLStyleElement);
      expect(sharedImpl).not.toHaveBeenCalled();
    });

    it("delegates non-style qualified names to the shared creator", () => {
      const sentinel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      const { shared, sharedImpl } = setup(sentinel);
      const create = makeCreateElementDistortion(CREATE_ELEMENT_NS, shared);

      const el = create.call(
        document,
        "http://www.w3.org/2000/svg",
        "svg:script",
      );

      expect(shared).toHaveBeenCalledWith(CREATE_ELEMENT_NS);
      expect(sharedImpl).toHaveBeenCalledWith(
        "http://www.w3.org/2000/svg",
        "svg:script",
        undefined,
      );
      expect(el).toBe(sentinel);
    });
  });
});
