/* eslint "react/prop-types": "warn" */
import React, { useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { usePrevious } from "metabase/hooks/use-previous";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import MainPane from "./MainPane";
import DatabasePane from "./DatabasePane";
import SchemaPane from "./SchemaPane";
import TablePane from "./TablePane";
import FieldPane from "./FieldPane";
import SegmentPane from "./SegmentPane";
import MetricPane from "./MetricPane";
import ModelPane from "./ModelPane";

const PANES = {
  database: DatabasePane, // displays either schemas or tables in a database
  schema: SchemaPane, // displays tables in a schema
  table: TablePane, // displays fields of a table
  field: FieldPane,
  model: ModelPane, // displays columns of a model
  segment: SegmentPane,
  metric: MetricPane,
};

const DataReferencePropTypes = {
  query: PropTypes.object.isRequired,
  dataReferenceStack: PropTypes.array.isRequired,
  setDataReferenceStack: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  runQuestionQuery: PropTypes.func.isRequired,
  setDatasetQuery: PropTypes.func.isRequired,
};

const DataReference = ({
  query,
  setDataReferenceStack,
  dataReferenceStack,
  onClose,
  ...props
}) => {
  const previousDbId = usePrevious(query?.database()?.id);
  // initialize the stack if it's empty or the database changed
  useEffect(() => {
    if (dataReferenceStack?.length || query?.database()?.id === previousDbId) {
      return;
    }
    const stack = [];
    if (query?.database()) {
      stack.push({ type: "database", item: query.database() });
    }
    if (query?.table()) {
      stack.push({ type: "table", item: query.table() });
    }
    setDataReferenceStack(stack);
  });

  const back = useCallback(() => {
    setDataReferenceStack(dataReferenceStack.slice(0, -1));
  }, [setDataReferenceStack, dataReferenceStack]);

  const onItemClick = useCallback(
    (type, item) => {
      setDataReferenceStack(dataReferenceStack.concat({ type, item }));
    },
    [setDataReferenceStack, dataReferenceStack],
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
        onBack={back}
      />
    );
  } else {
    return (
      <SidebarContent title={t`Data Reference`} onClose={onClose}>
        <MainPane {...props} onItemClick={onItemClick} />
      </SidebarContent>
    );
  }
};

DataReference.propTypes = DataReferencePropTypes;

export default DataReference;
