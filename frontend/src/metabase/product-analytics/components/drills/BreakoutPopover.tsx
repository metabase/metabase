import { useMemo, useState } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/querying/common/components/QueryColumnPicker";
import { Alert, Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import { DrillMenu, DrillMenuLoader } from "./DrillMenu";

const STAGE = -1;

type ColumnType = "category" | "location" | "time";
type ColumnGroupKey = ColumnType | "other";

const COLUMN_TYPES: readonly ColumnType[] = ["category", "location", "time"];

const COLUMN_TYPE_ICONS: Record<ColumnType, IconName> = {
  category: "string",
  location: "location",
  time: "calendar",
};

const getColumnTypeTitle = (type: ColumnType): string => {
  switch (type) {
    case "category":
      return t`Category`;
    case "location":
      return t`Location`;
    case "time":
      return t`Time`;
  }
};

/** Like the query builder's "Break out by…" drill, with strings as categories. */
const getColumnType = (column: Lib.ColumnMetadata): ColumnType | null => {
  if (Lib.isTemporal(column)) {
    return "time";
  }
  if (Lib.isAddress(column)) {
    return "location";
  }
  const isCategorical =
    Lib.isCategory(column) ||
    Lib.isBoolean(column) ||
    (Lib.isStringOrStringLike(column) && !Lib.isID(column));
  return isCategorical ? "category" : null;
};

type BreakoutPopoverProps = {
  /** A count query on the event table, to pick breakout columns from. */
  query: Lib.Query;
  /** Resolves once the new question is open. */
  onSelect: (column: Lib.ColumnMetadata) => Promise<void>;
  onClose: () => void;
};

export const BreakoutPopover = ({
  query,
  onSelect,
  onClose,
}: BreakoutPopoverProps) => {
  const [type, setType] = useState<ColumnType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnsByType = useMemo(
    () =>
      Object.groupBy(
        Lib.breakoutableColumns(query, STAGE),
        (column): ColumnGroupKey => getColumnType(column) ?? "other",
      ),
    [query],
  );
  const types = COLUMN_TYPES.filter(
    (item) => (columnsByType[item]?.length ?? 0) > 0,
  );

  const handleSelect = async (column: Lib.ColumnMetadata) => {
    setIsLoading(true);
    setError(null);
    try {
      await onSelect(column);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  };

  if (isLoading || error !== null) {
    return (
      <DrillMenu
        items={[]}
        status={
          error !== null ? (
            <Alert color="error">{error}</Alert>
          ) : (
            <DrillMenuLoader label={t`Finding who's in this group…`} />
          )
        }
      />
    );
  }

  const columns = type !== null ? columnsByType[type] : undefined;
  if (columns !== undefined) {
    return (
      <Box mah="65vh">
        <QueryColumnPicker
          query={query}
          stageIndex={STAGE}
          columnGroups={Lib.groupColumns(columns)}
          checkIsColumnSelected={() => false}
          onSelect={handleSelect}
          onClose={onClose}
        />
      </Box>
    );
  }

  return (
    <DrillMenu
      items={types.map((item) => ({
        key: item,
        title: getColumnTypeTitle(item),
        icon: COLUMN_TYPE_ICONS[item],
        onClick: () => setType(item),
      }))}
    />
  );
};
