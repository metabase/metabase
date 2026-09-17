import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";

import { render, screen } from "__support__/ui";

import { Sortable } from "./Sortable";

type SetupOpts = {
  attributesOnDragHandle?: boolean;
};

function setup({ attributesOnDragHandle }: SetupOpts = {}) {
  render(
    <DndContext>
      <SortableContext items={["item"]}>
        <Sortable
          id="item"
          attributesOnDragHandle={attributesOnDragHandle}
          role="listitem"
        >
          {({ dragHandleRef, dragHandleListeners, dragHandleAttributes }) => (
            <span
              ref={dragHandleRef}
              data-testid="handle"
              {...(attributesOnDragHandle ? dragHandleAttributes : {})}
              {...dragHandleListeners}
            />
          )}
        </Sortable>
      </SortableContext>
    </DndContext>,
  );
}

describe("Sortable", () => {
  it("keeps the activator attributes on the wrapper for render-prop consumers by default", () => {
    setup();

    expect(screen.getByRole("listitem")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-describedby");
    expect(screen.getByTestId("handle")).not.toHaveAttribute("tabindex");
  });

  it("moves the activator attributes onto the drag handle when asked to", () => {
    setup({ attributesOnDragHandle: true });

    expect(screen.getByRole("listitem")).not.toHaveAttribute("tabindex");
    expect(screen.getByTestId("handle")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("handle")).toHaveAttribute("aria-describedby");
  });
});
