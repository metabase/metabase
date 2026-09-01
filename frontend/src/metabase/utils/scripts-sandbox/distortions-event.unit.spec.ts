import { makeSandboxDistortionCallback } from "./distortions";
import { GLOBAL_BLOCKED_EVENT_TYPES } from "./distortions-event";

const setterOf = (target: object, key: string) =>
  Object.getOwnPropertyDescriptor(target, key)?.set;

// Blocked event types with no on* IDL handler attribute in this environment,
// so addEventListener is the only way to listen for them here. Real engines
// place some of these accessors differently (e.g. Chrome exposes
// Document.prototype.onbeforecopy); the gating loop in
// distortions-blocked-apis.ts reads live descriptors, so it gates whatever
// the environment actually exposes.
const TYPES_WITHOUT_HANDLER_ATTRIBUTE = new Set([
  "beforepaste",
  "beforecopy",
  "beforecut",
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

const TYPES_WITH_WINDOW_HANDLER = [...GLOBAL_BLOCKED_EVENT_TYPES].filter(
  (type) => !TYPES_WITHOUT_HANDLER_ATTRIBUTE.has(type),
);

// `storage` events fire at window only, so Document has no onstorage.
const TYPES_WITH_DOCUMENT_HANDLER = TYPES_WITH_WINDOW_HANDLER.filter(
  (type) => type !== "storage",
);

describe("scripts-sandbox global event-handler setter distortions", () => {
  it("distorts addEventListener('keydown') on document (reference boundary)", () => {
    const distort = makeSandboxDistortionCallback("plugin 1");
    const addEventListener = distort(EventTarget.prototype.addEventListener);

    expect(() =>
      addEventListener.call(document, "keydown", () => {}, true),
    ).toThrow(/blocked addEventListener for global event type: keydown/);
  });

  it("distorts the Document.cookie setter (reference boundary)", () => {
    const distort = makeSandboxDistortionCallback("plugin 1");
    const cookieSetter = setterOf(Document.prototype, "cookie");
    if (!cookieSetter) {
      throw new Error("expected a Document.cookie setter");
    }

    expect(distort(cookieSetter)).not.toBe(cookieSetter);
  });

  // Window is a WebIDL [Global] interface, so its on* accessors are own
  // properties of the window instance, not Window.prototype.
  it.each(TYPES_WITH_WINDOW_HANDLER)(
    "replaces the window.on%s instance setter with a distortion that refuses the assignment",
    (type) => {
      const distort = makeSandboxDistortionCallback("plugin 1");
      const handlerSetter = setterOf(window, `on${type}`);
      if (!handlerSetter) {
        throw new Error(`expected an on${type} setter on the window instance`);
      }

      const distorted = distort(handlerSetter);
      expect(distorted).not.toBe(handlerSetter);

      expect(() => distorted.call(window, () => {})).toThrow(
        /blocked API call/,
      );
    },
  );

  it.each(TYPES_WITH_DOCUMENT_HANDLER)(
    "replaces the Document.prototype.on%s setter with a distortion that refuses the assignment",
    (type) => {
      const distort = makeSandboxDistortionCallback("plugin 1");
      const handlerSetter = setterOf(Document.prototype, `on${type}`);
      if (!handlerSetter) {
        throw new Error(`expected an on${type} setter on Document.prototype`);
      }

      const distorted = distort(handlerSetter);
      expect(distorted).not.toBe(handlerSetter);

      expect(() => distorted.call(document, () => {})).toThrow(
        /blocked API call/,
      );
    },
  );

  it.each([...TYPES_WITHOUT_HANDLER_ATTRIBUTE])(
    "on%s has no handler attribute in this environment — addEventListener is the only listen path",
    (type) => {
      expect(GLOBAL_BLOCKED_EVENT_TYPES.has(type)).toBe(true);
      expect(`on${type}` in window).toBe(false);
      expect(`on${type}` in document).toBe(false);
    },
  );
});
