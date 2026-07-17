// TODO: cover smoothTextEvents — word-by-word splitting, tail flush before
// non-text events, and id-boundary flush between separate text blocks.
describe("smoothTextEvents", () => {
  it.todo("emits buffered text one word at a time");
  it.todo("flushes the buffered tail before a non-text event");
  it.todo("flushes when a delta from a new text id arrives");
});
