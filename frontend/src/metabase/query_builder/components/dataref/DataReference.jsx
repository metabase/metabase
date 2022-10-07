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
import SegmentPane from "./SegmentPane";
import MetricPane from "./MetricPane";
import QuestionPane from "./QuestionPane";

const PANES = {
  database: DatabasePane, // displays either schemas or tables in a database
  schema: SchemaPane, // displays tables in a schema
  table: TablePane, // displays fields of a table
  question: QuestionPane, // displays columns of a question
  field: FieldPane,
  segment: SegmentPane,
  metric: MetricPane,
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
