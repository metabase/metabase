import { makeSandboxDistortionCallback } from "./distortions";
import { GLOBAL_BLOCKED_EVENT_TYPES } from "./distortions-event";

type HandlerSetterOf<T> = Extract<keyof T, `on${string}`>;

const WINDOW_HANDLER_SETTERS: readonly HandlerSetterOf<Window>[] = [
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

const DOCUMENT_HANDLER_SETTERS: readonly HandlerSetterOf<Document>[] = [
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onbeforeinput",
  "oninput",
  "onpaste",
  "oncopy",
  "oncut",
];

const BODY_HANDLER_SETTERS: readonly HandlerSetterOf<HTMLBodyElement>[] = [
  "onstorage",
];

const FRAMESET_HANDLER_SETTERS: readonly HandlerSetterOf<HTMLFrameSetElement>[] =
  ["onstorage"];

const SETTER_TARGETS = [
  {
    name: "window instance",
    target: window,
    receiver: window,
    setters: WINDOW_HANDLER_SETTERS,
  },
  {
    name: "Document.prototype",
    target: Document.prototype,
    receiver: document,
    setters: DOCUMENT_HANDLER_SETTERS,
  },
  {
    name: "HTMLBodyElement.prototype",
    target: HTMLBodyElement.prototype,
    receiver: document.createElement("body"),
    setters: BODY_HANDLER_SETTERS,
  },
  {
    name: "HTMLFrameSetElement.prototype",
    target: HTMLFrameSetElement.prototype,
    receiver: document.createElement("frameset"),
    setters: FRAMESET_HANDLER_SETTERS,
  },
];

function setterOf(target: object, key: string) {
  return Object.getOwnPropertyDescriptor(target, key)?.set;
}

function blockedHandlerSettersOn(target: object) {
  return [...GLOBAL_BLOCKED_EVENT_TYPES]
    .map((type) => `on${type}`)
    .filter((handler) => setterOf(target, handler))
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
    const cookieSetter = setterOf(Document.prototype, "cookie");
    if (!cookieSetter) {
      throw new Error("expected a Document.cookie setter");
    }

    expect(distort(cookieSetter)).not.toBe(cookieSetter);
  });

  describe.each(SETTER_TARGETS)(
    "$name",
    ({ name, target, receiver, setters }) => {
      it("lists every blocked event type that has a handler setter here", () => {
        expect([...setters].sort()).toEqual(blockedHandlerSettersOn(target));
      });

      it.each(setters)(
        "replaces the %s setter with a distortion that refuses the assignment",
        (handler) => {
          const distort = makeSandboxDistortionCallback("plugin 1");
          const handlerSetter = setterOf(target, handler);
          if (!handlerSetter) {
            throw new Error(`expected a ${handler} setter on ${name}`);
          }

          const distorted = distort(handlerSetter);
          expect(distorted).not.toBe(handlerSetter);

          expect(() => distorted.call(receiver, () => {})).toThrow(
            /blocked API call/,
          );
        },
      );
    },
  );
});
