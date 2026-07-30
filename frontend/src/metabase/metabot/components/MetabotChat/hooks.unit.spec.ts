import { calculateFillerHeight } from "./hooks";

type MessageSpec = {
  role: "user" | "agent";
  clientHeight: number;
};

const setClientHeight = (el: HTMLElement, value: number) => {
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    value,
  });
};

type SetupOpts = {
  containerClientHeight: number;
  paddingTop?: string;
  paddingBottom?: string;
  messages: MessageSpec[];
};

const setup = ({
  containerClientHeight,
  paddingTop = "0px",
  paddingBottom = "0px",
  messages,
}: SetupOpts) => {
  const container = document.createElement("div");
  const inner = document.createElement("div");
  container.appendChild(inner);

  setClientHeight(container, containerClientHeight);
  container.style.paddingTop = paddingTop;
  container.style.paddingBottom = paddingBottom;

  for (const { role, clientHeight } of messages) {
    const el = document.createElement("div");
    el.setAttribute("data-message-role", role);
    setClientHeight(el, clientHeight);
    inner.appendChild(el);
  }

  const fillerEl = document.createElement("div");
  setClientHeight(fillerEl, 0);
  inner.appendChild(fillerEl);

  return { container, fillerEl };
};

describe("calculateFillerHeight", () => {
  it("fills the space below the current turn so the prompt can reach the top", () => {
    const { container, fillerEl } = setup({
      containerClientHeight: 500,
      messages: [
        { role: "agent", clientHeight: 100 },
        { role: "user", clientHeight: 40 },
        { role: "agent", clientHeight: 120 },
      ],
    });

    // 500 - (40 + 120) - 1 = 339 (only the last turn counts)
    expect(calculateFillerHeight(container, fillerEl)).toBe(339);
  });

  it("accounts for the scroll container's vertical padding", () => {
    const { container, fillerEl } = setup({
      containerClientHeight: 500,
      paddingTop: "16px",
      paddingBottom: "24px",
      messages: [
        { role: "user", clientHeight: 40 },
        { role: "agent", clientHeight: 120 },
      ],
    });

    // 500 - 40 (padding) - 160 (turn) - 1 = 299
    expect(calculateFillerHeight(container, fillerEl)).toBe(299);
  });

  it("never returns a negative height when the turn is taller than the viewport", () => {
    const { container, fillerEl } = setup({
      containerClientHeight: 200,
      messages: [
        { role: "user", clientHeight: 40 },
        { role: "agent", clientHeight: 400 },
      ],
    });

    expect(calculateFillerHeight(container, fillerEl)).toBe(0);
  });
});
