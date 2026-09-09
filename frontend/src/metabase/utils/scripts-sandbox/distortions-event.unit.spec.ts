import { makeSandboxDistortionCallback } from "./distortions";
import {
  GLOBAL_BLOCKED_EVENT_TYPES,
  addEventListenerDistortion,
} from "./distortions-event";

function asStringArg(value: object): string {
  // type helper to pass non-string values as string in tests
  return value as unknown as string;
}

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

describe("addEventListenerDistortion", () => {
  const addEventListener = addEventListenerDistortion("plugin 1");

  it("blocks a global blocked event type supplied as a non-string", () => {
    const type = { toString: () => "keydown" };

    expect(() =>
      addEventListener.call(document, asStringArg(type), () => {}),
    ).toThrow(/blocked addEventListener for global event type: keydown/);
  });

  it("registers the listener for the same value the check saw", () => {
    let reads = 0;
    const type = { toString: () => (reads++ === 0 ? "click" : "keydown") };
    const listener = jest.fn();

    addEventListener.call(document, asStringArg(type), listener);

    document.dispatchEvent(new Event("keydown"));
    expect(listener).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("click"));
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener("click", listener);
  });

  it("allows blocked event types on non-global targets", () => {
    const el = document.createElement("div");
    const listener = jest.fn();

    addEventListener.call(el, "keydown", listener);

    el.dispatchEvent(new Event("keydown"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
