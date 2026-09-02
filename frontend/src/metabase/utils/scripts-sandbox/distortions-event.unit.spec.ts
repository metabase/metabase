import { makeSandboxDistortionCallback } from "./distortions";
import {
  GLOBAL_BLOCKED_EVENT_TYPES,
  addEventListenerDistortion,
} from "./distortions-event";

function asStringArg(value: object): string {
  // type helper to pass non-string values as string in tests
  return value as unknown as string;
}

const setterOf = (proto: object, key: string) =>
  Object.getOwnPropertyDescriptor(proto, key)?.set;

const GLOBAL_TARGETS = [
  { name: "Document", proto: Document.prototype },
  { name: "Window", proto: Window.prototype },
];

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

  it("distorts every on* setter that mirrors a blocked global event type", () => {
    const distort = makeSandboxDistortionCallback("plugin 1");

    // filter out the event types that don't have an on* setter in this environment
    const results = [...GLOBAL_BLOCKED_EVENT_TYPES].flatMap((type) =>
      GLOBAL_TARGETS.flatMap(({ name, proto }) => {
        const setter = setterOf(proto, `on${type}`);
        // filter out the event types that don't have an on* setter in this environment
        return setter
          ? [
              {
                label: `${name}.on${type}`,
                distorted: distort(setter) !== setter,
              },
            ]
          : [];
      }),
    );

    const undistorted = results.filter((r) => !r.distorted).map((r) => r.label);
    expect(undistorted).toEqual([]);
    // make sure that at least some setter in the env were found
    expect(results.length).toBeGreaterThan(0);
  });

  it("replaces the Document.onkeydown setter with a distortion that refuses the assignment", () => {
    const distort = makeSandboxDistortionCallback("plugin 1");
    const onkeydownSetter = setterOf(Document.prototype, "onkeydown");
    if (!onkeydownSetter) {
      throw new Error("expected a Document.onkeydown setter");
    }

    const distorted = distort(onkeydownSetter);
    expect(distorted).not.toBe(onkeydownSetter);

    expect(() => distorted.call(document, () => {})).toThrow();
  });
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
