import { EditorState } from "@codemirror/state";

import { matchTagAtCursor } from "./util";

describe("matchTagAtCursor", () => {
  function setup(
    doc: string,
    cursor: number | { anchor: number; head: number } = 0,
  ) {
    const selection = typeof cursor === "number" ? { anchor: cursor } : cursor;
    const state = EditorState.create({
      doc: doc.trim(),
      selection,
    });
    return { state };
  }

  it("should match nothing if there are no tags", () => {
    const { state } = setup("select * from table");
    expect(matchTagAtCursor(state)).toBeNull();
  });

  it("should match nothing if there are no tags on the line", () => {
    const { state } = setup(`
      select * from table
      {{ foo }}
    `);
    expect(matchTagAtCursor(state)).toBeNull();
  });

  it("should match nothing if the cursor is not inside a tag", () => {
    const { state } = setup("select * from table {{ foo }}", 0);

    expect(matchTagAtCursor(state)).toBeNull();
  });

  it("should match a tag if the cursor is inside it", () => {
    const { state } = setup("select {{ foo }} limit 1", 10);

    expect(matchTagAtCursor(state)).toEqual({
      type: "variable",
      tag: {
        from: 7,
        to: 16,
        text: "{{ foo }}",
      },
      content: {
        from: 10,
        to: 13,
        text: "foo",
      },
      hasClosingTag: true,
    });
  });

  it("should match a card tag if the cursor is inside it", () => {
    const { state } = setup("select {{ #foo }} limit 1", 10);

    expect(matchTagAtCursor(state)).toEqual({
      type: "card",
      tag: {
        from: 7,
        to: 17,
        text: "{{ #foo }}",
      },
      content: {
        from: 11,
        to: 14,
        text: "foo",
      },
      hasClosingTag: true,
    });
  });

  it("should match a snippet tag if the cursor is inside it", () => {
    const { state } = setup("select {{ snippet: foo }} limit 1", 10);
    expect(matchTagAtCursor(state)).toEqual({
      type: "snippet",
      tag: {
        from: 7,
        to: 25,
        text: "{{ snippet: foo }}",
      },
      content: {
        from: 19,
        to: 22,
        text: "foo",
      },
      hasClosingTag: true,
    });
  });

  it("should not match a tag if it is open ended", () => {
    const { state } = setup("select {{ foo", 10);
    expect(matchTagAtCursor(state)).toBeNull();
  });

  it("should not match a tag if it is open ended, but the option is set", () => {
    const { state } = setup("select {{ foo ", 10);
    expect(matchTagAtCursor(state, { allowOpenEnded: true })).toEqual({
      type: "variable",
      tag: {
        from: 7,
        to: 13,
        text: "{{ foo",
      },
      content: {
        from: 10,
        to: 13,
        text: "foo",
      },
      hasClosingTag: false,
    });
  });

  it("should match tags independent of internal whitespace", () => {
    const tags = [
      "{{foo}}",
      "{{ foo}}",
      "{{  foo}}",
      "{{foo }}",
      "{{foo }}",
      "{{ foo }}",
      "{{   foo   }}",
      "{{ snippet:foo   }}",
      "{{ snippet:    foo   }}",
      "{{ #foo }}",
      "{{#foo}}",
      "{{    #foo}}",
      "{{    #foo    }}",
    ];

    for (const tag of tags) {
      const { state } = setup(tag, 2);
      const match = matchTagAtCursor(state);
      expect(match).toEqual({
        type: expect.any(String),
        content: {
          text: "foo",
          from: expect.any(Number),
          to: expect.any(Number),
        },
        tag: {
          text: tag,
          from: 0,
          to: tag.length,
        },
        hasClosingTag: true,
      });
    }
  });

  it("should return no match when there is a selection", () => {
    const { state } = setup("select {{ foo }} limit 1", {
      anchor: 10,
      head: 15,
    });
    const match = matchTagAtCursor(state);
    expect(match).toBeNull();
  });
});
