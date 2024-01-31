import type { IconName } from "metabase/ui";
import { Button, Flex } from "metabase/ui";
import {
  PaletteInput,
  PaletteItemDisplay,
  PaletteModal,
  PaletteModalContainer,
  PaletteResultIcon,
  PaletteResultList,
} from "./Palette.styled";
import { useEffect, useRef } from "react";

export type PaletteItem = {
  id: string;
  title: string;
  icon: IconName;
  run: (arg?: string) => void;
};

export const Palette = ({ closePalette }: { closePalette: () => void }) => {
  const items: PaletteItem[] = [
    {
      id: "create-new-dashboard",
      title: "Create new dashboard",
      icon: "dashboard",
      run: () => {
        alert("create new dashboard");
      },
    },
    {
      id: "create-new-question",
      title: "Create new question",
      icon: "question",
      run: () => {
        alert("create new question");
      },
    },
  ];
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusableElementsRef = useRef<Map<
    string,
    HTMLInputElement | HTMLButtonElement
  > | null>(null);

  const getFocusableElementsMap = () => {
    if (!inputRef.current) return null;
    if (!focusableElementsRef.current) {
      focusableElementsRef.current = new Map();
      focusableElementsRef.current.set(
        "metabase-palette-input",
        inputRef.current,
      );
    }
    return focusableElementsRef.current;
  };

  const focusAdjacentButton = (direction: "up" | "down") => {
    const delta = direction === "up" ? -1 : 1;
    if (!document.activeElement) return;
    const activeId = document.activeElement.id;
    const focusables = getFocusableElementsMap();
    if (!focusables) return;
    const ids = [...focusables.keys()];
    const activeIndex = ids.indexOf(activeId);
    if (activeIndex === -1) return;
    const targetId = ids[(activeIndex + delta) % ids.length];
    focusables.get(targetId)?.focus();
  };

  useEffect(() => {
    if (!modalRef.current) return;
    if (!inputRef.current) return;
    inputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      console.log("e", e);
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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
  }, [closePalette, focusAdjacentButton, modalRef, inputRef]);
  return (
    <PaletteModal onClose={closePalette}>
      <PaletteModalContainer ref={modalRef}>
        <PaletteInput ref={inputRef} placeholder="Jump to..." />
        <PaletteResultList>
          {items.map(({ id, title, icon, run }) => (
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
                      : getFocusableElementsMap()?.delete(title)
                  }
                >
                  <PaletteResultIcon name={icon} />
                  {title}
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
