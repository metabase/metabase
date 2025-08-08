import { type ReactNode, useMemo } from "react";

import { createMockMetadata } from "__support__/metadata";
import { AccordionList } from "metabase/common/components/AccordionList/AccordionList";
import type { Section } from "metabase/common/components/AccordionList/types";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

interface Props {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  table: Table;
  onChange: (column: DatasetColumn) => void;
}

type ColumnItem = {
  name: string;
  displayName: string;
  column: DatasetColumn;
};

export const ColumnPicker = ({ columns, sections, table, onChange }: Props) => {
  const accordionSections = useMemo(() => {
    return getSections(columns, sections);
  }, [columns, sections]);

  return (
    <AccordionList
      globalSearch
      renderItemDescription={omitDescription}
      renderItemIcon={(item) => renderItemIcon(table, item)}
      renderItemName={renderItemName}
      renderItemWrapper={renderItemWrapper}
      sections={accordionSections}
      searchable
      searchProp={["name", "displayName"]}
      width={300}
      onChange={(item) => onChange(item.column)}
    />
  );
};

function getSections(
  columns: DatasetColumn[],
  sections: ObjectViewSectionSettings[],
): Section<ColumnItem>[] {
  const sectionFieldIds = new Set(
    sections.flatMap((section) => {
      return section.fields.map((field) => field.field_id);
    }),
  );

  const unsectionedColumns = columns.filter(
    (column) => column.id && !sectionFieldIds.has(column.id),
  );

  return [
    {
      items: getSectionItems(unsectionedColumns),
      type: "header" as const,
    },
  ].filter((section) => section.items.length > 0);
}

function getSectionItems(columns: DatasetColumn[]): ColumnItem[] {
  return columns.map((column) => ({
    name: column.name,
    displayName: column.display_name,
    column,
  }));
}

function renderItemName(item: ColumnItem) {
  return item.displayName;
}

export function renderItemIcon(table: Table, item: ColumnItem) {
  const query = getQuery(table);
  const column = Lib.fromLegacyColumn(query, 0, item.column);

  return (
    <QueryColumnInfoIcon
      query={query}
      stageIndex={0}
      column={column}
      position="top-start"
      size={18}
    />
  );
}

export function getQuery(table: Table): Lib.Query {
  const metadata = createMockMetadata({
    tables: table
      ? [
          {
            ...table,
            // When table is hidden metabase-lib will give an empty list of columns for it.
            // We need to pretend it is visible so that FilterPickerBody can know about it.
            visibility_type: null,
          },
        ]
      : [],
  });
  const metadataProvider = Lib.metadataProvider(table.db_id, metadata);

  return Lib.fromLegacyQuery(table.db_id, metadataProvider, {
    type: "query",
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
  });
}

function omitDescription() {
  return undefined;
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}
