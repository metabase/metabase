import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  popDataReferenceStack,
  pushDataReferenceStack,
} from "metabase/query_builder/actions";
import type { DataReferenceStackItem } from "metabase-types/store/data-stack";

import DatabasePane from "./DatabasePane";
import FieldPane from "./FieldPane";
import MainPane from "./MainPane";
import QuestionPane from "./QuestionPane";
import SchemaPane from "./SchemaPane";
import TablePane from "./TablePane";

const PANES = {
  database: DatabasePane, // lists schemas, tables and models of a database
  schema: SchemaPane, // lists tables of a schema
  table: TablePane, // lists fields of a table
  question: QuestionPane, // lists fields of a question
  field: FieldPane, // field details and metadata
};

type DataReferenceProps = {
  onClose: () => void;
};

export const DataReference = ({ onClose }: DataReferenceProps) => {
  const dataReferenceStack = useSelector(
    state => state.qb.uiControls.dataReferenceStack,
  );

  const dispatch = useDispatch();
  const pushStack = (item: DataReferenceStackItem) =>
    dispatch(pushDataReferenceStack(item));
  const popStack = () => dispatch(popDataReferenceStack());

  if (dataReferenceStack.length) {
    const page = dataReferenceStack[dataReferenceStack.length - 1];
    const Pane = PANES[page.type];
    return (
      <Pane
        {...{ [page.type]: page.item }}
        onItemClick={pushStack}
        onClose={onClose}
        onBack={popStack}
      />
    );
  } else {
    return <MainPane onItemClick={pushStack} onClose={onClose} />;
  }
};
