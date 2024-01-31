import type { ChangeEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Flex } from "metabase/ui";
import {
  useCommandPalette,
  type CommandPaletteAction,
} from "../hooks/useCommandPalette";
import {
  PaletteInput,
  PaletteItemDisplay,
  PaletteModal,
  PaletteModalContainer,
  PaletteResultIcon,
  PaletteResultList,
} from "./Palette.styled";

export const Palette = ({ closePalette }: { closePalette: () => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const items: CommandPaletteAction[] = useCommandPalette({ query }).results;
  const modalRef = useRef<HTMLDivElement>(null);
  const focusableElementsRef = useRef<Map<
    string,
    HTMLInputElement | HTMLButtonElement
  > | null>(null);

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = event => {
    setQuery(event.target.value);
  };

  const getFocusableElementsMap = () => {
    if (!inputRef.current) {
      return null;
    }
    if (!focusableElementsRef.current) {
      focusableElementsRef.current = new Map();
      focusableElementsRef.current.set(
        "metabase-palette-input",
        inputRef.current,
      );
    }
    return focusableElementsRef.current;
  };

  useEffect(() => {
    const focusAdjacentButton = (direction: "up" | "down") => {
      const delta = direction === "up" ? -1 : 1;
      if (!document.activeElement) {
        return;
      }
      const activeId = document.activeElement.id;
      const focusables = getFocusableElementsMap();
      if (!focusables) {
        return;
      }
      const ids = [...focusables.keys()];
      const activeIndex = ids.indexOf(activeId);
      if (activeIndex === -1) {
        return;
      }
      const targetId = ids[(activeIndex + delta) % ids.length];
      focusables.get(targetId)?.focus();
    };
    if (!modalRef.current) {
      return;
    }
    if (!inputRef.current) {
      return;
    }
    inputRef.current.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.key === "Escape") {
        closePalette();
      }
      if (e.key === "ArrowDown") {
        focusAdjacentButton("down");
      }
      if (e.key === "ArrowUp") {
        focusAdjacentButton("up");
      }
    };
    const modal = modalRef.current;
    modal.addEventListener("keydown", onKeyDown);
    return () => {
      modal.removeEventListener("keydown", onKeyDown);
    };
  }, [closePalette, modalRef, inputRef]);

  return (
    <PaletteModal onClose={closePalette}>
      <PaletteModalContainer ref={modalRef}>
        <PaletteInput
          onChange={handleInputChange}
          ref={inputRef}
          placeholder="Jump to..."
        />
        <PaletteResultList>
          {items.map(({ id, name, icon, run }) => (
            <PaletteItemDisplay key={id}>
              <Flex>
                <Button
                  onClick={() => {
                    run();
                  }}
                  id={getButtonId(id)}
                  ref={(node: HTMLButtonElement | null) =>
                    node
                      ? getFocusableElementsMap()?.set(getButtonId(id), node)
                      : getFocusableElementsMap()?.delete(getButtonId(id))
                  }
                >
                  <PaletteResultIcon name={icon} />
                  {name}
                </Button>
              </Flex>
            </PaletteItemDisplay>
          ))}
        </PaletteResultList>
      </PaletteModalContainer>
    </PaletteModal>
  );
};

const getButtonId = (id: string) => `metabase-palette-item-${id}`;
