import { useCallback, useLayoutEffect } from "react";

import { MenuItemComponent } from "metabase/rich_text_editing/tiptap/extensions/shared/MenuComponents";

import type { NewQuestionMenuItem, NewQuestionModals } from "./types";

interface Props {
  menuItems: NewQuestionMenuItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  newQuestionType: "notebook" | "native" | null;
  setNewQuestionType: (type: "notebook" | "native" | null) => void;
  onSave: (id: number, name: string) => void;
  onClose: () => void;
  modals: NewQuestionModals;
}

export const NewQuestionTypeMenuView = ({
  menuItems,
  selectedIndex,
  setSelectedIndex,
  newQuestionType,
  setNewQuestionType,
  onSave,
  onClose,
  modals: { notebook: NotebookQuestionModal, native: NativeQuestionModal },
}: Props) => {
  const handleSaveNewQuestion = useCallback(
    (id: number, name: string) => {
      setNewQuestionType(null);
      onSave(id, name);
    },
    [onSave, setNewQuestionType],
  );

  useLayoutEffect(() => {
    if (menuItems.length === 1) {
      setNewQuestionType(menuItems[0].value);
    }
  }, [menuItems, setNewQuestionType]);

  return (
    <>
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={item.value}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => setNewQuestionType(item.value)}
          onMouseEnter={() => setSelectedIndex(index)}
        />
      ))}

      {newQuestionType === "notebook" && (
        <NotebookQuestionModal
          onSave={handleSaveNewQuestion}
          onClose={onClose}
        />
      )}

      {newQuestionType === "native" && (
        <NativeQuestionModal onSave={handleSaveNewQuestion} onClose={onClose} />
      )}
    </>
  );
};
