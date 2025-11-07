import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import {
  type MenuItem,
  MenuItemComponent,
} from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import { CreateNativeQuestionModal } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/modals/CreateNativeQuestionModal";
import { CreateStructuredQuestionModal } from "metabase-enterprise/rich_text_editing/tiptap/extensions/CardEmbed/modals/CreateStructuredQuestionModal";

interface Props {
  selectedIndex: number;
  setSelectedIndex: (newValue: number) => void;
  onSave: (id: number, name: string) => void;
  onClose: () => void;
}

interface CustomMenuItem extends MenuItem {
  value: "native" | "notebook";
}

export const NewQuestionTypeMenuView = ({
  selectedIndex,
  setSelectedIndex,
  onSave,
  onClose,
}: Props) => {
  const [modal, setModal] = useState<"native" | "notebook" | undefined>();

  const { data } = useListDatabasesQuery();
  const databases = useMemo(() => data?.data ?? [], [data]);
  const hasDataAccess = useMemo(() => getHasDataAccess(databases), [databases]);
  const hasNativeWrite = useMemo(
    () => getHasNativeWrite(databases),
    [databases],
  );

  const items = useMemo(() => {
    const result: CustomMenuItem[] = [];

    if (hasDataAccess) {
      result.push({
        label: t`New Question`,
        icon: "insight",
        value: "notebook" as const,
        action: _.noop,
      });
    }

    if (hasNativeWrite) {
      result.push({
        label: t`New SQL query`,
        icon: "sql",
        value: "native" as const,
        action: _.noop,
      });
    }

    return result;
  }, [hasDataAccess, hasNativeWrite]);

  return (
    <>
      {items.map((item, index) => (
        <MenuItemComponent
          key={item.value}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => setModal(item.value)}
          onMouseEnter={() => setSelectedIndex(index)}
        />
      ))}

      {modal === "notebook" && (
        <CreateStructuredQuestionModal onSave={onSave} onClose={onClose} />
      )}

      {modal === "native" && (
        <CreateNativeQuestionModal onSave={onSave} onClose={onClose} />
      )}
    </>
  );
};
