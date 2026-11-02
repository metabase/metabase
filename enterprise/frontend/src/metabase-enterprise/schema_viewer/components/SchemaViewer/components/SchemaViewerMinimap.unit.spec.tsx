import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";

import { renderWithProviders, screen } from "__support__/ui";

import { makeFlowNode } from "../utils/test-utils";

import { SchemaViewerMinimap } from "./SchemaViewerMinimap";

// Bounds 1000x800 fit the 200x160 minimap inside its 8px padding at scale
// 0.18, offset by (10, 8): minimap pixel (x, y) is graph point
// ((x - 10) / 0.18, (y - 8) / 0.18).
const NODES = [
  makeFlowNode({ id: 1, position: { x: 0, y: 0 }, width: 500, height: 160 }),
  makeFlowNode({
    id: 2,
    position: { x: 500, y: 640 },
    width: 500,
    height: 160,
  }),
  makeFlowNode({ id: 3, position: { x: 250, y: 300 }, width: 100, height: 50 }),
];

type CanvasMock = { __getEvents: () => { type: string }[] };

function setup() {
  const user = userEvent.setup();
  const onPanStart = jest.fn();
  const onPanTo = jest.fn();
  const onPanEnd = jest.fn();
  renderWithProviders(
    // The React Flow store is empty: the minimap must draw from `nodes`.
    <ReactFlowProvider>
      <SchemaViewerMinimap
        nodes={NODES}
        edges={[]}
        onPanStart={onPanStart}
        onPanTo={onPanTo}
        onPanEnd={onPanEnd}
      />
    </ReactFlowProvider>,
  );
  return { user, onPanStart, onPanTo, onPanEnd };
}

// jsdom lacks PointerEvent; React dispatches by event type, and MouseEvent
// carries the button and client coordinates the minimap reads.
function firePointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY }),
    );
  });
}

function getMinimap() {
  const minimap = screen.getByTestId("schema-viewer-minimap");
  jest.spyOn(minimap, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 160,
    width: 200,
    height: 160,
    toJSON: () => ({}),
  });
  return minimap;
}

describe("SchemaViewerMinimap", () => {
  afterEach(() => jest.restoreAllMocks());

  it("draws every logical node, including ones React Flow has not rendered", () => {
    setup();

    const canvas = screen.getByTestId<HTMLCanvasElement>(
      "schema-viewer-minimap-canvas",
    );
    // jest-canvas-mock (loaded in jest-setup) adds `__getEvents` to every 2D context.
    const context = canvas.getContext("2d") as unknown as CanvasMock | null;
    const fillRects = context
      ?.__getEvents()
      .filter((event) => event.type === "fillRect");

    expect(fillRects).toHaveLength(NODES.length);
  });

  it("pans the canvas to the pressed and dragged graph positions", () => {
    const { onPanStart, onPanTo, onPanEnd } = setup();
    const minimap = getMinimap();

    firePointer(minimap, "pointerdown", 100, 80);
    firePointer(minimap, "pointermove", 28, 26);
    firePointer(minimap, "pointerup", 28, 26);
    firePointer(minimap, "pointermove", 0, 0);

    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(onPanTo.mock.calls).toEqual([
      [{ x: 500, y: 400 }],
      [{ x: 100, y: 100 }],
    ]);
    expect(onPanEnd).toHaveBeenCalledTimes(1);
  });

  it("unmounts the minimap and provides a control to restore it", async () => {
    const { user } = setup();

    expect(screen.getByTestId("schema-viewer-minimap")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide minimap" }));

    expect(
      screen.queryByTestId("schema-viewer-minimap"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show minimap" }));

    expect(screen.getByTestId("schema-viewer-minimap")).toBeInTheDocument();
  });
});
