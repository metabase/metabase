import { useState } from "react";
import { t } from "ttag";

import { FieldPanel } from "metabase/querying/fields/components/FieldPanel";
import { Button } from "metabase/ui";
import type { ChartSettingTableColumnsProps } from "metabase/viz-core";
import type * as Lib from "metabase-lib";

import { TableColumnPanel } from "./TableColumnPanel";
import { canEditQuery } from "./utils";

export const ChartSettingTableColumns = ({
  value,
  columns,
  question,
  isShowingDetailsOnlyColumns,
  getColumnName,
  onChange,
  onShowWidget,
}: ChartSettingTableColumnsProps) => {
  const query = question?.query();
  const stageIndex = -1;
  const hasEditButton = canEditQuery(query);
  const [isEditingQuery, setIsEditingQuery] = useState(false);

  const handleQueryChange = (query: Lib.Query) => {
    onChange(value, question?.setQuery(query));
  };

  return (
    <div>
      {hasEditButton && (
        <Button
          pl="0"
          variant="subtle"
          onClick={() => setIsEditingQuery(!isEditingQuery)}
        >
          {isEditingQuery ? t`Done picking columns` : t`Add or remove columns`}
        </Button>
      )}
      {query != null && isEditingQuery ? (
        <FieldPanel
          query={query}
          stageIndex={stageIndex}
          onChange={handleQueryChange}
        />
      ) : (
        <TableColumnPanel
          columns={columns}
          columnSettings={value}
          isShowingDetailsOnlyColumns={isShowingDetailsOnlyColumns}
          getColumnName={getColumnName}
          onChange={onChange}
          onShowWidget={onShowWidget}
        />
      )}
    </div>
  );
};
