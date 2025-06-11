import { useCallback } from "react";

import DatabasePane from "./DatabasePane";
import FieldPane from "./FieldPane";
import MainPane from "./MainPane";
import QuestionPane from "./QuestionPane";
import SchemaPane from "./SchemaPane";
import TablePane from "./TablePane";

export type DataReferenceType = "database" | "schema" | "table" | "question" | "field";

export interface DataReferenceStackItem {
  type: DataReferenceType;
  // TODO: fix this type based on usage
  item: unknown;
}

interface DataReferenceProps {
  dataReferenceStack: DataReferenceStackItem[];
  popDataReferenceStack: () => void;
  pushDataReferenceStack: (item: DataReferenceStackItem) => void;
  onClose?: () => void;
  onBack?: () => void;
}

const PANES: Record<DataReferenceType, React.ComponentType<any>> = {
  database: DatabasePane, // lists schemas, tables and models of a database
  schema: SchemaPane, // lists tables of a schema
  table: TablePane, // lists fields of a table
  question: QuestionPane, // lists fields of a question
  field: FieldPane, // field details and metadata
};

const DataReference = ({
  dataReferenceStack,
  popDataReferenceStack,
  pushDataReferenceStack,
  onClose,
  onBack,
}: DataReferenceProps) => {
  const onItemClick = useCallback(
    (type: DataReferenceType, item: unknown) => pushDataReferenceStack({ type, item }),
    [pushDataReferenceStack],
  );

  if (dataReferenceStack.length) {
    const page = dataReferenceStack[dataReferenceStack.length - 1];
    const Pane = PANES[page.type];
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

// eslint-disable-next-line import/no-default-export
export default DataReference;
