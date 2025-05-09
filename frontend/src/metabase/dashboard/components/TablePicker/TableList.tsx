import { t } from "ttag";

import { useListTablesQuery } from "metabase/api";
import SelectList from "metabase/components/SelectList/SelectList";
import type { TableId } from "metabase-types/api";

type TableListProps = {
  onSelect: (cardId: TableId) => void;
};

export const TableList = ({ onSelect }: TableListProps) => {
  const { data: tables } = useListTablesQuery();

  if (!tables) {
    return <div>{t`Nothing found`}</div>;
  }

  return (
    <SelectList>
      {tables.map((item) => (
        <SelectList.Item
          key={item.id}
          id={item.id}
          name={item.display_name}
          icon={{
            name: "table",
            size: 16,
          }}
          onSelect={onSelect}
        />
      ))}
    </SelectList>
  );
};
