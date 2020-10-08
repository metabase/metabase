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

  // NOTE (based on original Tom Robinson's note from 1/7/2019):
  // this worked in karma but jsdom doesn't have the required APIs on div/contenteditable
  xit("should get/set selection on contenteditable correctly", () => {
    const contenteditable = document.createElement("div");
    container.appendChild(contenteditable);
    contenteditable.textContent = "<div>hello world</div>";
    setSelectionPosition(contenteditable, [3, 6]);
    const position = getSelectionPosition(contenteditable);
    expect(position).toEqual([3, 6]);
  });

  xit("should not mutate the actual selection", () => {
    const contenteditable = document.createElement("div");
    container.appendChild(contenteditable);
    contenteditable.textContent = "<div>hello world</div>";
    setSelectionPosition(contenteditable, [3, 6]);
    const position = getSelectionPosition(contenteditable);
    expect(position).toEqual([3, 6]);
    const position2 = getSelectionPosition(contenteditable);
    expect(position2).toEqual([3, 6]);
  });
});
