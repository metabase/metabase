import { makeSandboxDistortionCallback } from "./distortions";
import { GLOBAL_BLOCKED_EVENT_TYPES } from "./distortions-event";

type WindowHandlerSetter = Extract<keyof Window, `on${string}`>;
type DocumentHandlerSetter = Extract<keyof Document, `on${string}`>;

const WINDOW_HANDLER_SETTERS: readonly WindowHandlerSetter[] = [
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onbeforeinput",
  "oninput",
  "onpaste",
  "oncopy",
  "oncut",
  "onstorage",
];

const DOCUMENT_HANDLER_SETTERS: readonly DocumentHandlerSetter[] = [
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onbeforeinput",
  "oninput",
  "onpaste",
  "oncopy",
  "oncut",
];

function getSetterOf(target: object, key: string) {
  return Object.getOwnPropertyDescriptor(target, key)?.set;
}

function getBlockedHandlerSettersOn(target: object) {
  return [...GLOBAL_BLOCKED_EVENT_TYPES]
    .map((type) => `on${type}`)
    .filter((handler) => getSetterOf(target, handler))
    .sort();
}

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
    const cookieSetter = getSetterOf(Document.prototype, "cookie");
    if (!cookieSetter) {
      throw new Error("expected a Document.cookie setter");
    }

    expect(distort(cookieSetter)).not.toBe(cookieSetter);
  });

  it("lists every blocked event type that has a handler setter on the window instance", () => {
    expect([...WINDOW_HANDLER_SETTERS].sort()).toEqual(
      getBlockedHandlerSettersOn(window),
    );
  });

  it("lists every blocked event type that has a handler setter on Document.prototype", () => {
    expect([...DOCUMENT_HANDLER_SETTERS].sort()).toEqual(
      getBlockedHandlerSettersOn(Document.prototype),
    );
  });

  it.each(WINDOW_HANDLER_SETTERS)(
    "replaces the window.%s instance setter with a distortion that refuses the assignment",
    (handler) => {
      const distort = makeSandboxDistortionCallback("plugin 1");
      const handlerSetter = getSetterOf(window, handler);
      if (!handlerSetter) {
        throw new Error(`expected a ${handler} setter on the window instance`);
      }

      const distorted = distort(handlerSetter);
      expect(distorted).not.toBe(handlerSetter);

      expect(() => distorted.call(window, () => {})).toThrow(
        /blocked API call/,
      );
    },
  );

  it.each(DOCUMENT_HANDLER_SETTERS)(
    "replaces the Document.prototype.%s setter with a distortion that refuses the assignment",
    (handler) => {
      const distort = makeSandboxDistortionCallback("plugin 1");
      const handlerSetter = getSetterOf(Document.prototype, handler);
      if (!handlerSetter) {
        throw new Error(`expected a ${handler} setter on Document.prototype`);
      }

      const distorted = distort(handlerSetter);
      expect(distorted).not.toBe(handlerSetter);

      expect(() => distorted.call(document, () => {})).toThrow(
        /blocked API call/,
      );
    },
  );
});
