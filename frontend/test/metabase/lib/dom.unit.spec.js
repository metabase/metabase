import { getSelectionPosition, setSelectionPosition } from "metabase/lib/dom";

describe("getSelectionPosition/setSelectionPosition", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    document.body.removeChild(container);
  });

  it("should get/set selection on input correctly", () => {
    const input = document.createElement("input");
    container.appendChild(input);
    input.value = "hello world";
    setSelectionPosition(input, [3, 6]);
    const position = getSelectionPosition(input);
    expect(position).toEqual([3, 6]);
  });
});
