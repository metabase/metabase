import { stripTextShadows } from "./strip-text-shadows";

describe("stripTextShadows", () => {
  it("removes textShadow* keys at any depth, keeping everything else", () => {
    const option = {
      animation: false,
      series: {
        label: {
          fontSize: 12,
          textShadowColor: "rgba(0, 0, 0, 0.5)",
          textShadowBlur: 4,
          textShadowOffsetX: 0,
          textShadowOffsetY: 0,
          rich: {
            name: { color: "white", textShadowColor: "black" },
          },
        },
        data: [
          {
            id: "0",
            label: { formatter: "{name|a}", textShadowBlur: 2 },
            children: [{ id: "0-0", upperLabel: { textShadowColor: "red" } }],
          },
        ],
      },
    };

    expect(stripTextShadows(option)).toEqual({
      animation: false,
      series: {
        label: {
          fontSize: 12,
          rich: { name: { color: "white" } },
        },
        data: [
          {
            id: "0",
            label: { formatter: "{name|a}" },
            children: [{ id: "0-0", upperLabel: {} }],
          },
        ],
      },
    });
  });

  it("passes through primitives and arrays", () => {
    expect(stripTextShadows([1, "a", null])).toEqual([1, "a", null]);
    expect(stripTextShadows(null)).toBeNull();
  });
});
