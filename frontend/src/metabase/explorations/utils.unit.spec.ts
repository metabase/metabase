import { getAdjacentById, shouldIgnoreKeyboardEvent } from "./utils";

const items = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];

describe("getAdjacentById", () => {
  it("returns null for an empty list", () => {
    // make the empty list by slicing so that type inference works
    expect(getAdjacentById(items.slice(0, 0), "a", 1)).toBeNull();
  });

  it("returns the next item when moving forward within the list", () => {
    expect(getAdjacentById(items, "a", 1)).toEqual(items[1]);
    expect(getAdjacentById(items, "b", 1)).toEqual(items[2]);
  });

  it("loops to the first item when moving forward past the end", () => {
    expect(getAdjacentById(items, "c", 1)).toEqual(items[0]);
  });

  it("returns the previous item when moving backward within the list", () => {
    expect(getAdjacentById(items, "c", -1)).toEqual(items[1]);
    expect(getAdjacentById(items, "b", -1)).toEqual(items[0]);
  });

  it("loops to the last item when moving backward past the start", () => {
    expect(getAdjacentById(items, "a", -1)).toEqual(items[2]);
  });

  it("steps onto the first item moving forward with no current selection", () => {
    expect(getAdjacentById(items, null, 1)).toEqual(items[0]);
    expect(getAdjacentById(items, "missing", 1)).toEqual(items[0]);
  });

  it("steps onto the last item moving backward with no current selection", () => {
    expect(getAdjacentById(items, null, -1)).toEqual(items[2]);
    expect(getAdjacentById(items, "missing", -1)).toEqual(items[2]);
  });
});

describe("shouldIgnoreKeyboardEvent", () => {
  function makeEvent(
    target: EventTarget,
    init: KeyboardEventInit = {},
  ): KeyboardEvent {
    const event = new KeyboardEvent("keydown", init);
    Object.defineProperty(event, "target", { value: target });
    return event;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("allows plain keys when the body is focused", () => {
    expect(shouldIgnoreKeyboardEvent(makeEvent(document.body))).toBe(false);
  });

  it.each([
    ["metaKey", { metaKey: true }],
    ["ctrlKey", { ctrlKey: true }],
    ["altKey", { altKey: true }],
  ])(
    "ignores chords with %s so browser/OS shortcuts keep working",
    (_name, init) => {
      expect(shouldIgnoreKeyboardEvent(makeEvent(document.body, init))).toBe(
        true,
      );
    },
  );

  it("allows shift-modified keys (they produce distinct key values, not chords)", () => {
    expect(
      shouldIgnoreKeyboardEvent(makeEvent(document.body, { shiftKey: true })),
    ).toBe(false);
  });

  it("allows keys within the exploration page", () => {
    const page = document.createElement("div");
    page.setAttribute("data-test-id", "exploration-page");
    const child = document.createElement("div");
    page.appendChild(child);
    document.body.appendChild(page);

    expect(shouldIgnoreKeyboardEvent(makeEvent(child))).toBe(false);
  });

  it("ignores keys on elements outside the exploration page", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    expect(shouldIgnoreKeyboardEvent(makeEvent(outside))).toBe(true);
  });

  it("ignores keys on interactive elements inside the exploration page", () => {
    const page = document.createElement("div");
    page.setAttribute("data-test-id", "exploration-page");
    const input = document.createElement("input");
    page.appendChild(input);
    document.body.appendChild(page);

    expect(shouldIgnoreKeyboardEvent(makeEvent(input))).toBe(true);
  });

  it("ignores non-element targets", () => {
    expect(shouldIgnoreKeyboardEvent(makeEvent(document))).toBe(true);
  });
});
