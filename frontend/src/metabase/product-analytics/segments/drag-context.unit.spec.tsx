import { useDroppable } from "@dnd-kit/core";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";

import {
  type ActiveDrag,
  type DragItem,
  SegmentDragProvider,
  useDragSource,
  useDropTarget,
  useDropTargetRegistration,
} from "./drag-context";
import type { PaletteSegment } from "./types";

type Rect = { left: number; top: number; width: number; height: number };

const RECTS: Record<string, Rect> = {
  source: { left: 0, top: 0, width: 100, height: 20 },
  slot: { left: 200, top: 0, width: 100, height: 40 },
  row: { left: 200, top: 100, width: 100, height: 40 },
};

const SEGMENT: PaletteSegment = {
  key: "draft-1",
  source: "event",
  status: "sample",
  name: "Big orders",
};

const SEGMENT_ITEM: DragItem = { kind: "segment", segment: SEGMENT };

const Source = () => {
  const { dragRef, dragListeners } = useDragSource(SEGMENT_ITEM);
  return (
    <div data-testid="source" ref={dragRef} {...dragListeners}>
      {SEGMENT.name}
    </div>
  );
};

type TargetProps = {
  accepts: (drag: ActiveDrag) => boolean;
  onDrop: (drag: ActiveDrag) => void;
};

const Slot = ({ accepts, onDrop }: TargetProps) => {
  const { isActive, dropProps } = useDropTarget({ accepts, onDrop });
  return (
    <div data-testid="slot" {...dropProps}>
      {isActive ? "Drop here" : "Slot"}
    </div>
  );
};

/** Stands in for a sortable row, whose droppable `useSortable` would create. */
const Row = ({ accepts, onDrop }: TargetProps) => {
  useDropTargetRegistration("row", { collision: "closest", accepts, onDrop });
  const { setNodeRef } = useDroppable({ id: "row" });
  return <div data-testid="row" ref={setNodeRef} />;
};

type SetupOpts = {
  slotAccepts?: boolean;
  rowAccepts?: boolean;
};

const setup = ({ slotAccepts = true, rowAccepts = false }: SetupOpts = {}) => {
  const onSlotDrop = jest.fn<void, [ActiveDrag]>();
  const onRowDrop = jest.fn<void, [ActiveDrag]>();
  renderWithProviders(
    <SegmentDragProvider isPaletteOpen>
      <Source />
      <Slot accepts={() => slotAccepts} onDrop={onSlotDrop} />
      <Row accepts={() => rowAccepts} onDrop={onRowDrop} />
    </SegmentDragProvider>,
  );
  return { onSlotDrop, onRowDrop };
};

const drag = (x: number, y: number) => {
  fireEvent.mouseDown(screen.getByTestId("source"), {
    button: 0,
    clientX: 10,
    clientY: 10,
  });
  // Past the activation distance first, then onto the target.
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: x, clientY: y });
  fireEvent.mouseUp(document, { clientX: x, clientY: y });
};

describe("SegmentDragProvider", () => {
  beforeEach(() => {
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const testId = this.getAttribute("data-testid") ?? "";
        const { left, top, width, height } = RECTS[testId] ?? {
          left: -1000,
          top: -1000,
          width: 0,
          height: 0,
        };
        return DOMRect.fromRect({ x: left, y: top, width, height });
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("drops onto the target under the pointer", () => {
    const { onSlotDrop } = setup();

    drag(250, 20);

    expect(onSlotDrop).toHaveBeenCalledTimes(1);
    expect(onSlotDrop).toHaveBeenCalledWith(
      expect.objectContaining({ item: SEGMENT_ITEM }),
      expect.anything(),
    );
  });

  it("doesn't drop onto a target that doesn't accept the item", () => {
    const { onSlotDrop } = setup({ slotAccepts: false });

    drag(250, 20);

    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it("doesn't drop when released away from every pointer target", () => {
    const { onSlotDrop, onRowDrop } = setup();

    drag(600, 600);

    expect(onSlotDrop).not.toHaveBeenCalled();
    expect(onRowDrop).not.toHaveBeenCalled();
  });

  it("drops onto the nearest closest-collision target when no pointer target is hit", () => {
    const { onSlotDrop, onRowDrop } = setup({
      slotAccepts: true,
      rowAccepts: true,
    });

    drag(600, 600);

    expect(onSlotDrop).not.toHaveBeenCalled();
    expect(onRowDrop).toHaveBeenCalledTimes(1);
  });

  it("prefers a pointer target over a closest-collision one", () => {
    const { onSlotDrop, onRowDrop } = setup({
      slotAccepts: true,
      rowAccepts: true,
    });

    drag(250, 20);

    expect(onSlotDrop).toHaveBeenCalledTimes(1);
    expect(onRowDrop).not.toHaveBeenCalled();
  });
});
