import { useMemo } from "react";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api";
import SelectList from "metabase/components/SelectList/SelectList";
import type { TableId } from "metabase-types/api";

type TableListProps = {
  onSelect: (cardId: TableId) => void;
};

export const TableList = ({ onSelect }: TableListProps) => {
  const { data: tables } = useListTablesQuery();

  const filteredTables = useMemo(() => {
    return tables
      ?.filter(({ db }) => db?.settings?.["database-enable-table-editing"])
      .sort((a, b) => {
        // sort by db name, then table name
        const aDbName = a.db?.name || "";
        const bDbName = b.db?.name || "";

        const dbOrder = aDbName.localeCompare(bDbName);
        if (dbOrder !== 0) {
          return dbOrder;
        }

        return a.display_name.localeCompare(b.display_name);
      });
  }, [tables]);

  if (!filteredTables) {
    return <div>{t`Nothing found`}</div>;
  }

  return (
    <SelectList>
      {filteredTables.map((item) => (
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
