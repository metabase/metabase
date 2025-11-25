import { useCallback, useLayoutEffect } from "react";

import { MenuItemComponent } from "metabase/documents/components/Editor/shared/MenuComponents";

import { CreateNativeQuestionModal } from "./CreateNativeQuestionModal";
import { CreateStructuredQuestionModal } from "./CreateStructuredQuestionModal";
import type { NewQuestionMenuItem } from "./types";

interface Props {
  menuItems: NewQuestionMenuItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  newQuestionType: "notebook" | "native" | null;
  setNewQuestionType: (type: "notebook" | "native" | null) => void;
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

export const NewQuestionTypeMenuView = ({
  menuItems,
  selectedIndex,
  setSelectedIndex,
  newQuestionType,
  setNewQuestionType,
  onSave,
  onClose,
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
        <CreateStructuredQuestionModal
          onSave={handleSaveNewQuestion}
          onClose={onClose}
        />
      )}

      {newQuestionType === "native" && (
        <CreateNativeQuestionModal
          onSave={handleSaveNewQuestion}
          onClose={onClose}
        />
      )}
    </>
  );
};
