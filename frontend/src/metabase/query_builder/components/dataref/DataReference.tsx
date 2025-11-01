import { useCallback } from "react";

import type Field from "metabase-lib/v1/metadata/Field";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { CardId, ConcreteTableId, DatabaseId } from "metabase-types/api";

import DatabasePane from "./DatabasePane";
import FieldPane from "./FieldPane";
import MainPane from "./MainPane";
import { QuestionPane } from "./QuestionPane";
import SchemaPane from "./SchemaPane";
import { TablePane } from "./TablePane";

type DatabaseItem = {
  id: DatabaseId;
};

type SchemaItem = Schema;

type TableItem = {
  id: ConcreteTableId;
};

type QuestionItem = {
  id: CardId;
};

type FieldItem = Field;

type PageType = string;

type PageItem =
  | DatabaseItem
  | SchemaItem
  | TableItem
  | QuestionItem
  | FieldItem;

export type DataReferenceStackItem = {
  type: PageType;
  item: PageItem;
};

const PANES = {
  database: DatabasePane, // lists schemas, tables and models of a database
  schema: SchemaPane, // lists tables of a schema
  table: TablePane, // lists fields of a table
  question: QuestionPane, // lists fields of a question
  field: FieldPane, // field details and metadata
};

type DataReferenceProps = {
  dataReferenceStack: DataReferenceStackItem[];
  popDataReferenceStack: () => void;
  pushDataReferenceStack: (item: DataReferenceStackItem) => void;
  onClose?: () => void;
  onBack?: () => void;
};

const DataReference = ({
  dataReferenceStack,
  popDataReferenceStack,
  pushDataReferenceStack,
  onClose,
  onBack,
}: DataReferenceProps) => {
  const onItemClick = useCallback(
    (type: string, item: unknown) =>
      pushDataReferenceStack({
        type: type as PageType,
        item: item as PageItem,
      }),
    [pushDataReferenceStack],
  );

  if (dataReferenceStack.length) {
    const page = dataReferenceStack[dataReferenceStack.length - 1];
    const Pane = PANES[page.type as keyof typeof PANES];
    return (
      <Pane
        {...{ [page.type]: page.item }}
        onItemClick={onItemClick}
        onClose={onClose}
        onBack={popDataReferenceStack}
      />
    );
  } else {
    return (
      <MainPane onItemClick={onItemClick} onClose={onClose} onBack={onBack} />
    );
  }
};

export { DataReference };
