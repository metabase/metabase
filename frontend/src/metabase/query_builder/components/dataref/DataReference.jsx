/* eslint "react/prop-types": "warn" */
import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
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
  query: PropTypes.object.isRequired,
  dataReferenceStack: PropTypes.array.isRequired,
  popDataReferenceStack: PropTypes.func.isRequired,
  pushDataReferenceStack: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  runQuestionQuery: PropTypes.func.isRequired,
  setDatasetQuery: PropTypes.func.isRequired,
};

const DataReference = ({
  query,
  dataReferenceStack,
  popDataReferenceStack,
  pushDataReferenceStack,
  onClose,
  ...props
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
        {...props}
        {...{ [page.type]: page.item }}
        onItemClick={onItemClick}
        onClose={onClose}
        onBack={popDataReferenceStack}
      />
    );
  } else {
    return (
      <SidebarContent title={t`Data Reference`}>
        <MainPane {...props} onItemClick={onItemClick} />
      </SidebarContent>
    );
  }
};

DataReference.propTypes = DataReferencePropTypes;

export default DataReference;
