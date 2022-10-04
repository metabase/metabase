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
  table: TablePane, // displays fields in a table
  field: FieldPane,
  model: ModelPane, // displays columns of a model
  segment: SegmentPane,
  metric: MetricPane,
};

const TITLE_ICONS = {
  database: "database",
  schema: "folder",
  table: "table",
  field: "field",
  segment: "segment",
  metric: "metric",
  model: "model",
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
  setDataReferenceStack: setStack,
  dataReferenceStack: stack,
  onClose,
  ...props
}) => {
  const previousDbId = usePrevious(query?.database()?.id);
  useEffect(() => {
    if (query?.database()?.id === previousDbId) {
      return;
    }
    const stack = [];
    if (query?.database()) {
      stack.push({ type: "database", item: query.database() });
    }
    if (query?.table()) {
      stack.push({ type: "table", item: query.table() });
    }
    setStack(stack);
  });

  const back = useCallback(() => {
    setStack(stack.slice(0, -1));
  }, [setStack, stack]);

  const show = useCallback(
    (type, item, title) => {
      setStack(stack.concat({ type, item, title }));
    },
    [setStack, stack],
  );

  let title = null;
  let content = null;
  let icon = null;
  if (stack.length === 0) {
    title = t`Data Reference`;
    content = <MainPane {...props} show={show} />;
  } else {
    const page = stack[stack.length - 1];
    title = page.title || page.item.name;
    icon = TITLE_ICONS[page.type];
    const Pane = PANES[page.type];
    content = Pane && (
      <Pane {...props} {...{ [page.type]: page.item }} show={show} />
    );
  }
  return (
    <SidebarContent
      title={title}
      icon={icon}
      onBack={stack.length > 0 ? back : null}
      onClose={onClose}
    >
      <div className="px3">{content}</div>
    </SidebarContent>
  );
};

DataReference.propTypes = DataReferencePropTypes;

export default DataReference;
