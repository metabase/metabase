import { makeSandboxDistortionCallback } from "./distortions";

const setterOf = (proto: object, key: string) =>
  Object.getOwnPropertyDescriptor(proto, key)?.set;

const GLOBAL_EVENT_HANDLER_SETTERS = [
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "oninput",
  "onbeforeinput",
  "onpaste",
  "oncopy",
  "oncut",
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

  it("distorts every global event-handler setter on Document", () => {
    const distort = makeSandboxDistortionCallback("plugin 1");

    const undistorted = GLOBAL_EVENT_HANDLER_SETTERS.filter((name) => {
      const setter = setterOf(Document.prototype, name);
      // Only consider handlers present in this environment.
      return setter !== undefined && distort(setter) === setter;
    });

    expect(undistorted).toEqual([]);
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
