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
  
  it("does not hang or crash on malicious DOS input", () => {
      // Regex DOS vulnerability test vector
      const malicious = "data:\u0000" + "\u0000,".repeat(100000) + "\n1\n";
      const start = Date.now();
      const result = parseDataUri(malicious);
      const duration = Date.now() - start;
      expect(result).toBeNull();
      expect(duration).toBeLessThan(1000);
  });
});
