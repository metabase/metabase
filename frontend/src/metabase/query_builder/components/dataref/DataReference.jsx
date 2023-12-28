/* eslint "react/prop-types": "warn" */
import { useCallback } from "react";
import PropTypes from "prop-types";

import MainPane from "./MainPane";
import DatabasePane from "./DatabasePane";
import SchemaPane from "./SchemaPane";
import TablePane from "./TablePane";
import FieldPane from "./FieldPane";
import QuestionPane from "./QuestionPane";

const PANES = {
  database: DatabasePane, // lists schemas, tables and models of a database
  schema: SchemaPane, // lists tables of a schema
  table: TablePane, // lists fields of a table
  question: QuestionPane, // lists fields of a question
  field: FieldPane, // field details and metadata
};

const DataReferencePropTypes = {
  dataReferenceStack: PropTypes.array.isRequired,
  popDataReferenceStack: PropTypes.func.isRequired,
  pushDataReferenceStack: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const DataReference = ({
  dataReferenceStack,
  popDataReferenceStack,
  pushDataReferenceStack,
  onClose,
}) => {
  const onItemClick = useCallback(
    (type, item) => pushDataReferenceStack({ type, item }),
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
    return <MainPane onItemClick={onItemClick} onClose={onClose} />;
  }
};

DataReference.propTypes = DataReferencePropTypes;

export default DataReference;
