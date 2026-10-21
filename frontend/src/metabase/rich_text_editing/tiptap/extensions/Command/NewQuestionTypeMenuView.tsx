import { useCallback, useLayoutEffect } from "react";

import { MenuItemComponent } from "metabase/rich_text_editing/tiptap/extensions/shared/MenuComponents";

import type {
  NewQuestionMenuItem,
  NewQuestionModalType,
  NewQuestionModals,
} from "./types";

interface Props {
  menuItems: NewQuestionMenuItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  newQuestionType: NewQuestionModalType | null;
  setNewQuestionType: (type: NewQuestionModalType | null) => void;
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
      menuItems[0].action();
    }
  }, [menuItems]);

  return (
    <>
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={item.value}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => item.action()}
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
