import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

import { render, screen } from "__support__/ui";

import { Sortable } from "./Sortable";

function SortableInContext({ withKeyboard }: { withKeyboard: boolean }) {
  const pointerSensor = useSensor(PointerSensor);
  const keyboardSensor = useSensor(KeyboardSensor);

  return (
    <DndContext
      sensors={withKeyboard ? [pointerSensor, keyboardSensor] : [pointerSensor]}
    >
      <SortableContext items={["item"]}>
        <Sortable id="item">
          <span>Item</span>
        </Sortable>
      </SortableContext>
    </DndContext>
  );
}

describe("Sortable", () => {
  it("is a tab stop when it can be dragged with the keyboard", () => {
    render(<SortableInContext withKeyboard />);

    expect(screen.getByRole("button")).toHaveAttribute("tabindex", "0");
  });

  it("is not a tab stop when it can't be dragged with the keyboard", () => {
    render(<SortableInContext withKeyboard={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Item").parentElement).not.toHaveAttribute(
      "tabindex",
    );
  });
});
