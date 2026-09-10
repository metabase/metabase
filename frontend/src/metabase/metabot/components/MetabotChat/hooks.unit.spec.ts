import { calculateFillerHeight } from "./hooks";

type MessageSpec = {
  role: "user" | "agent";
  height: number;
  marginTop?: number;
};

const setRect = (el: HTMLElement, rect: { top: number; height: number }) => {
  el.getBoundingClientRect = () =>
    // jsdom has no layout; only top and height are read by the code under test
    ({ ...rect, bottom: rect.top + rect.height }) as DOMRect;
};

type SetupOpts = {
  containerHeight: number;
  paddingTop?: string;
  paddingBottom?: string;
  messages: MessageSpec[];
};

const setup = ({
  containerHeight,
  paddingTop = "0px",
  paddingBottom = "0px",
  messages,
}: SetupOpts) => {
  const container = document.createElement("div");
  const inner = document.createElement("div");
  container.appendChild(inner);

  setRect(container, { top: 0, height: containerHeight });
  container.style.paddingTop = paddingTop;
  container.style.paddingBottom = paddingBottom;

  let top = parseFloat(paddingTop);
  for (const { role, height, marginTop = 0 } of messages) {
    const el = document.createElement("div");
    el.setAttribute("data-message-role", role);
    top += marginTop;
    setRect(el, { top, height });
    top += height;
    inner.appendChild(el);
  }

  const fillerEl = document.createElement("div");
  setRect(fillerEl, { top, height: 0 });
  inner.appendChild(fillerEl);

  return { container, fillerEl };
};

describe("calculateFillerHeight", () => {
  it("fills the space below the current turn so the prompt can reach the top", () => {
    const { container, fillerEl } = setup({
      containerHeight: 500,
      messages: [
        { role: "agent", height: 100 },
        { role: "user", height: 40 },
        { role: "agent", height: 120 },
      ],
    });

    // 500 - (40 + 120) = 340 (only the last turn counts)
    expect(calculateFillerHeight(container, fillerEl)).toBe(340);
  });

  it("accounts for the scroll container's vertical padding", () => {
    const { container, fillerEl } = setup({
      containerHeight: 500,
      paddingTop: "16px",
      paddingBottom: "24px",
      messages: [
        { role: "user", height: 40 },
        { role: "agent", height: 120 },
      ],
    });

    // 500 - 40 (padding) - 160 (turn) = 300
    expect(calculateFillerHeight(container, fillerEl)).toBe(300);
  });

  it("includes margins between messages and rounds sub-pixel sizes down", () => {
    const { container, fillerEl } = setup({
      containerHeight: 500,
      messages: [
        { role: "user", height: 40.25 },
        { role: "agent", height: 120.5 },
        { role: "agent", height: 60, marginTop: 16 },
      ],
    });

    // 500 - (40.25 + 120.5 + 16 + 60) = 263.25 -> 263
    expect(calculateFillerHeight(container, fillerEl)).toBe(263);
  });

  it("never returns a negative height when the turn is taller than the viewport", () => {
    const { container, fillerEl } = setup({
      containerHeight: 200,
      messages: [
        { role: "user", height: 40 },
        { role: "agent", height: 400 },
      ],
    });

    expect(calculateFillerHeight(container, fillerEl)).toBe(0);
  });
});
