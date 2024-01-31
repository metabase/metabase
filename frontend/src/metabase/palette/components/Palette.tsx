import type {  Dispatch, SetStateAction } from "react";
import {  useRef, useState } from "react";
import { useCommandPalette } from "../hooks/useCommandPalette";
import {
  PaletteModal,
  PaletteModalContainer,
} from "./Palette.styled";
import "react-cmdk/dist/cmdk.css";
import CommandPalette, { JsonStructure, filterItems, getItemIndex } from "react-cmdk";

export const Palette = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  // const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<"root">("root");
  // this could become useState<"root" | "projects"> etc as we add pages

  const items = useCommandPalette();
  const filteredItems = filterItems(items as JsonStructure, query);
  // const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  // const focusableElementsRef = useRef<Map<
  //   string,
  //   HTMLInputElement | HTMLButtonElement
  // > | null>(null);

  // const getFocusableElementsMap = () => {
  //   if (!inputRef.current) {
  //     return null;
  //   }
  //   if (!focusableElementsRef.current) {
  //     focusableElementsRef.current = new Map();
  //   }
  //   return focusableElementsRef.current;
  // };

  // useEffect(() => {
  //   const focusAdjacentButton = (direction: "up" | "down") => {
  //     const delta = direction === "up" ? -1 : 1;
  //     if (activeItemId === null) {
  //       return;
  //     }
  //     const focusables = getFocusableElementsMap();
  //     if (!focusables) {
  //       return;
  //     }
  //     const ids = [...focusables.keys()];
  //     const activeIndex = ids.indexOf(activeItemId);
  //     if (activeIndex === -1) {
  //       return;
  //     }
  //     const targetIndex = Math.min(
  //       Math.max(activeIndex + delta, 0),
  //       ids.length - 1,
  //     );
  //     const targetId = ids[targetIndex];
  //     setActiveItemId(targetId);
  //     // for (const [id, element] of focusables.entries()) {
  //     //   if (targetId === id) {
  //     //     element.classList.add("active");
  //     //   } else {
  //     //     element.classList.remove("active");
  //     //   }
  //     // }
  //   };
  //   if (!modalRef.current) {
  //     return;
  //   }
  //   if (!inputRef.current) {
  //     return;
  //   }
  //   inputRef.current.focus();
  //   const onKeyDown = (e: KeyboardEvent) => {
  //     if (e.ctrlKey || e.metaKey || e.altKey) {
  //       return;
  //     }
  //     if (e.key === "Escape") {
  //       setOpen(false);
  //     }
  //     if (e.key === "ArrowDown") {
  //       focusAdjacentButton("down");
  //     }
  //     if (e.key === "ArrowUp") {
  //       focusAdjacentButton("up");
  //     }
  //   };
  //   const modal = modalRef.current;
  //   modal.addEventListener("keydown", onKeyDown);
  //   return () => {
  //     modal.removeEventListener("keydown", onKeyDown);
  //   };
  // }, [setOpen, modalRef, inputRef]);

  return (
    <PaletteModal onClose={() => setOpen(false)}>
      <PaletteModalContainer ref={modalRef}>
        <CommandPalette
          onChangeSearch={setQuery}
          onChangeOpen={setOpen}
          search={query}
          isOpen={open}
          page={page}
        >
          <CommandPalette.Page id="root">
            {items.length ? (
              items.map(list => (
                <CommandPalette.List key={list.id} heading={list.heading}>
                  {list.items.map(({ id, ...rest }) => (
                    <CommandPalette.ListItem
                      key={id}
                      index={getItemIndex(items, id)}
                      {...rest}
                    />
                  ))}
                </CommandPalette.List>
              ))
            ) : (
              <CommandPalette.FreeSearchAction />
            )}
          </CommandPalette.Page>
        </CommandPalette>
      </PaletteModalContainer>
    </PaletteModal>
  );
};

const getButtonId = (id: string) => `metabase-palette-item-${id}`;
