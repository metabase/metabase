import React from "react";

import _ from "underscore";
import colors from "metabase/lib/colors";
import cx from "classnames";
import { assoc } from "icepick";

export function getColumnWells(
  [{ card: { dataset_query: datasetQuery }, data: { cols } }],
  settings,
) {
  const wells = {
    left: [],
    bottom: [],
  };

  const hasMoreColumns = true; //settings["_column_list"].length > 0;

  for (const [metricIndex, name] of settings["graph.metrics"].entries()) {
    const columnIndex = _.findIndex(cols, col => col.name === name);
    if (columnIndex >= 0) {
      const column = cols[columnIndex];
      wells.left.push({
        column: column,
        // dimension: query.dimensionForColumn(_.findWhere(cols, { name }));
        color: colors["accent1"],
        onRemove: props => {
          removeMetric(metricIndex, { settings, ...props });
        },
        renderPopover: props => {
          return (
            <SummarizePopover
              {...props}
              metricIndex={metricIndex}
              columnIndex={columnIndex}
            />
          );
        },
      });
    } else if (name) {
      wells.left.push({
        column: { name },
        onRemove: props => {
          removeMetric(metricIndex, { settings, ...props });
        },
      });
    }
  }
  for (const [dimensionIndex, name] of settings["graph.dimensions"].entries()) {
    const column = _.findWhere(cols, { name });
    if (column) {
      wells.bottom.push({
        column: column,
        color: colors["accent2"],
        onRemove: props => {
          removeDimension(dimensionIndex, {
            settings,
            ...props,
          });
        },
      });
    } else if (name) {
      wells.bottom.push({
        column: { name },
        onRemove: props => {
          removeDimension(dimensionIndex, {
            settings,
            ...props,
          });
        },
      });
    }
  }

  if (hasMoreColumns) {
    wells.left.push({
      placeholder: wells.left.length === 0 ? "y" : "+",
      canAdd: ({ aggregation, column, dimension }) =>
        aggregation
          ? true
          : column
            ? settings["graph._metric_filter"](column)
            : dimension
              ? settings["graph._metric_filter"](dimension.field())
              : false,
      onAdd: (item, props) => {
        addMetric(item, { settings, ...props });
      },
    });
    if (wells.bottom.length === 0) {
      wells.bottom.push({
        placeholder: "x",
        canAdd: ({ column, dimension }) =>
          column
            ? settings["graph._dimension_filter"](column)
            : dimension
              ? settings["graph._dimension_filter"](dimension.field())
              : false,
        onAdd: (item, props) => {
          addDimension(item, { settings, ...props });
        },
      });
    } else if (wells.bottom.length === 1) {
      wells.bottom.push({
        placeholder: "Series breakout",
        canAdd: ({ column, dimension }) =>
          column
            ? settings["graph._dimension_filter"](column)
            : dimension
              ? settings["graph._dimension_filter"](dimension.field())
              : false,
        onAdd: (item, props) => {
          addDimension(item, { settings, ...props });
        },
      });
    }
  }
  return wells;
}

function isNew(question, settings) {
  return (
    settings["graph.dimensions"].filter(n => n).length === 0 ||
    settings["graph.metrics"].filter(n => n).length === 0
  );
}

function isSummarized(question) {
  return !question.query().isRaw();
}

function addMetric({ column, dimension, aggregation }, props) {
  if (column) {
    if (isNew(props.question, props.settings)) {
      const dimension = props.query.dimensionForColumn(column);
      if (dimension) {
        addSummarizedDimensionMetric(dimension, props);
      }
    } else {
      addRawMetric(column, props);
    }
  } else if (aggregation) {
    addSummarizedAggregationMetric(aggregation, props);
  } else if (dimension) {
    addSummarizedDimensionMetric(dimension, props);
  }
}

function addDimension({ column, dimension }, props) {
  if (column) {
    if (isNew(props.question, props.settings)) {
      const dimension = props.query.dimensionForColumn(column);
      if (dimension) {
        addSummarizedDimension(dimension, props);
      }
    } else {
      addRawDimension(column, props);
    }
  } else if (dimension) {
    addSummarizedDimension(dimension, props);
  }
}

function removeDimension(dimensionIndex, props) {
  if (isSummarized(props.question)) {
    removeSummarizedDimension(dimensionIndex, props);
  } else {
    removeRawDimension(dimensionIndex, props);
  }
}

function removeMetric(metricIndex, props) {
  if (isSummarized(props.question, props.settings)) {
    removeSummarizedMetric(metricIndex, props);
  } else {
    removeRawMetric(metricIndex, props);
  }
}

function addRawMetric(column, { settings, onChangeSettings }) {
  onChangeSettings({
    "graph.metrics": settings["graph.metrics"]
      .filter(n => n)
      .concat([column.name]),
  });
}

function removeRawMetric(index, { settings, onChangeSettings }) {
  onChangeSettings({
    "graph.metrics": settings["graph.metrics"].filter((n, i) => i !== index),
  });
}

function addRawDimension(column, { settings, onChangeSettings }) {
  onChangeSettings({
    "graph.dimensions": settings["graph.dimensions"]
      .filter(n => n)
      .concat([column.name]),
  });
}

function removeRawDimension(index, { settings, onChangeSettings }) {
  onChangeSettings({
    "graph.dimensions": settings["graph.dimensions"].filter(
      (n, i) => i !== index,
    ),
  });
}

async function addSummarizedDimensionMetric(
  dimension,
  { query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const aggregation = dimension.defaultAggregation();
  const name = query.formatExpression(aggregation);
  console.log("addSummarizedMetric", name, aggregation);
  await query
    .addAggregation(["named", aggregation, name])
    .update(q => onChangeDatasetQuery(q, true));
  onChangeSettings({
    "graph.metrics": settings["graph.metrics"].concat([name]),
  });
}

async function addSummarizedAggregationMetric(
  aggregation,
  { query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const name = query.formatExpression(aggregation);
  console.log("addSummarizedMetricMetric", name, aggregation);
  await query
    .addAggregation(["named", aggregation, name])
    .update(q => onChangeDatasetQuery(q, true));
  onChangeSettings({
    "graph.metrics": settings["graph.metrics"].concat([name]),
  });
}

function removeSummarizedMetric(
  index,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const name = settings["graph.metrics"][index];
  console.log("removeSummarizedMetric", name, index);
  // leave aggregation in query so it can easily be added back in, only remove from settings
  onChangeSettings({
    "graph.metrics": settings["graph.metrics"].filter((n, i) => i !== index),
  });
}

async function addSummarizedDimension(
  dimension,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const breakout = dimension.defaultBreakout();
  const name = dimension.field().name;
  console.log("addSummarizedDimension", name, breakout);
  await query.addBreakout(breakout).update(q => onChangeDatasetQuery(q, true));
  onChangeSettings({
    "graph.dimensions": settings["graph.dimensions"].concat([name]),
  });
}

function findBreakoutIndex(query, name) {
  return _.findIndex(query.breakoutDimensions(), d => d.columnName() === name);
}

function findAggregationIndex(query, name) {
  return _.findIndex(
    query.aggregationDimensions(),
    d => d.columnName() === name,
  );
}

async function removeSummarizedDimension(
  index,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const name = settings["graph.dimensions"][index];
  // remove breakout from query and settings
  const breakoutIndex = findBreakoutIndex(query, name);
  console.log("removeSummarizedDimension", name, index, breakoutIndex);
  if (breakoutIndex >= 0) {
    await query
      .removeBreakout(index)
      .update(q => onChangeDatasetQuery(q, true));
  }
  onChangeSettings({
    "graph.dimensions": settings["graph.dimensions"].filter(
      (n, i) => i !== index,
    ),
  });
}

async function changeSummarizedAggregation(
  metricIndex,
  agg,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const name = settings["graph.metrics"][metricIndex];
  const aggregationIndex = findAggregationIndex(query, name);
  if (aggregationIndex >= 0) {
    let aggregation = query.aggregations()[aggregationIndex];
    // FIXME: query lib
    if (aggregation[0] === "named") {
      aggregation = aggregation[1];
    }
    aggregation = assoc(aggregation, 0, agg.short);
    const newName = query.formatExpression(aggregation);
    await query
      .updateAggregation(aggregationIndex, ["named", aggregation, newName])
      .question()
      .updateSettings({
        "graph.metrics": assoc(settings["graph.metrics"], metricIndex, newName),
      })
      .update(null, true);
  }
}

async function switchToSummarized(
  metricIndex,
  agg,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const [{ data: { cols } }] = series;

  for (const [index, name] of settings["graph.metrics"].entries()) {
    const dimension = query.dimensionForColumn(_.findWhere(cols, { name }));
    if (dimension) {
      const aggregation = dimension.defaultAggregation();
      // set the aggregation to the chosen one for the selected metric
      if (metricIndex === index) {
        aggregation[0] = agg.short;
      }
      const name = query.formatExpression(aggregation);
      query = query.addAggregation(["named", aggregation, name]);
    }
  }

  for (const name of settings["graph.dimensions"]) {
    const dimension = query.dimensionForColumn(_.findWhere(cols, { name }));
    if (dimension) {
      query = query.addBreakout(dimension.defaultBreakout());
    }
  }

  // NOTE: need to wait for query to update otherwise changing settings will overwrite query :-/
  await query.update(q => onChangeDatasetQuery(q, true));
  // NOTE: just rely on defaults for now, they work well with summarized queries
  onChangeSettings({
    "graph.metrics": undefined,
    "graph.dimensions": undefined,
  });
}

async function switchToUnsummarized(
  index,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const [{ data: { cols } }] = series;

  const metrics = [];
  for (const name of settings["graph.metrics"]) {
    const dimension = query.dimensionForColumn(_.findWhere(cols, { name }));
    if (dimension) {
      metrics.push(dimension.field().name);
    }
  }

  const dimensions = [];
  for (const name of settings["graph.dimensions"]) {
    const dimension = query.dimensionForColumn(_.findWhere(cols, { name }));
    if (dimension) {
      dimensions.push(dimension.field().name);
    }
  }

  // reset to raw data / bare rows
  query = query.clearAggregations().clearBreakouts();

  // NOTE: need to wait for query to update otherwise changing settings will overwrite query :-/
  await query.update(q => onChangeDatasetQuery(q, true));

  onChangeSettings({
    "graph.metrics": metrics,
    "graph.dimensions": dimensions,
  });
}

const SummarizePopover = props => {
  const { query, onClose, metricIndex, columnIndex } = props;
  const isRaw = query.isBareRows();

  const columnDimension = query.columnDimensions()[columnIndex];
  let aggs = [];
  let aggregation;
  if (columnDimension) {
    aggs = columnDimension.field().aggregations();
    aggregation = columnDimension.aggregation && columnDimension.aggregation();
  }

  return (
    <SummarizeList>
      {aggs &&
        aggs.map(agg => (
          <SummarizeItem
            selected={aggregation && aggregation[0] === agg.short}
            onClick={
              isRaw
                ? () => {
                    switchToSummarized(metricIndex, agg, props);
                    onClose();
                  }
                : () => {
                    changeSummarizedAggregation(metricIndex, agg, props);
                    onClose();
                  }
            }
          >
            {agg.name}
          </SummarizeItem>
        ))}
      <SummarizeItem
        selected={isRaw}
        onClick={
          isRaw
            ? null
            : () => {
                switchToUnsummarized(metricIndex, props);
                onClose();
              }
        }
      >
        Don't summarize
      </SummarizeItem>
    </SummarizeList>
  );
};

const SummarizeList = ({ children }) => <div className="p1">{children}</div>;

const SummarizeItem = ({ selected, onClick, children }) => (
  <div
    className={cx(
      "p1 cursor-pointer rounded",
      selected ? "bg-brand text-white" : "text-brand-hover",
    )}
    onClick={onClick}
  >
    {children}
  </div>
);
