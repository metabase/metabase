import { join } from "path";

import { plugin } from "bun";
// jsdom is installed as a transitive dep of jest-environment-jsdom.
// With Bun's isolated linker, we need to import from the resolved path.
const jsdomPath = require.resolve("jsdom", {
  paths: [require.resolve("jest-environment-jsdom")],
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require(jsdomPath);

// Set up jsdom environment for transitive imports that reference DOM globals
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

Object.defineProperty(globalThis, "window", {
  value: dom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: dom.window.HTMLElement,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "Element", {
  value: dom.window.Element,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "Node", {
  value: dom.window.Node,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "Event", {
  value: dom.window.Event,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "KeyboardEvent", {
  value: dom.window.KeyboardEvent,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "MouseEvent", {
  value: dom.window.MouseEvent,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "CustomEvent", {
  value: dom.window.CustomEvent,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "getComputedStyle", {
  value: dom.window.getComputedStyle,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "requestAnimationFrame", {
  value: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  value: clearTimeout,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "Range", {
  value: dom.window.Range,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "DocumentFragment", {
  value: dom.window.DocumentFragment,
  writable: true,
  configurable: true,
});

// ResizeObserver is not provided by jsdom — add a no-op stub
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverStub,
  writable: true,
  configurable: true,
});
Object.defineProperty(dom.window, "ResizeObserver", {
  value: ResizeObserverStub,
  writable: true,
  configurable: true,
});

const STUB_FILE = join(import.meta.dir, "__mocks__", "fileMock.js");

// Stub CSS/image/asset imports that may appear in transitive dependencies.
plugin({
  name: "asset-stub",
  setup(build) {
    const assetFilter =
      /\.(css|less|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot|otf|webp|mp4|webm|wav|mp3|m4a|aac|oga)$/;

    build.onResolve({ filter: assetFilter }, () => ({
      path: STUB_FILE,
    }));
  },
});

// Load dayjs plugins (timezone, utc) used by the timezone tests
import "metabase/lib/dayjs";
