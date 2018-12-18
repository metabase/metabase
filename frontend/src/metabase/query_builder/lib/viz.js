import React from "react";

import _ from "underscore";
import colors from "metabase/lib/colors";
import cx from "classnames";

export function getColumnWells(
  [{ card: { dataset_query: datasetQuery }, data: { cols } }],
  settings,
) {
  const wells = {
    left: [],
    bottom: [],
  };

  const hasMoreColumns = settings["_column_list"].length > 0;

  for (const [metricIndex, name] of settings["graph.metrics"].entries()) {
    const columnIndex = _.findIndex(cols, col => col.name === name);
    if (columnIndex >= 0) {
      const column = cols[columnIndex];
      wells.left.push({
        column: column,
        color: colors["accent1"],
        onRemove: ({ onChangeSettings }) => {
          removeRawMetric(metricIndex, { settings, onChangeSettings });
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
        onRemove: ({ onChangeSettings }) => {
          removeRawMetric(metricIndex, { settings, onChangeSettings });
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
        onRemove: ({ onChangeSettings }) => {
          removeRawDimension(dimensionIndex, { settings, onChangeSettings });
        },
      });
    } else if (name) {
      wells.bottom.push({
        column: { name },
        onRemove: ({ onChangeSettings }) => {
          removeRawDimension(dimensionIndex, { settings, onChangeSettings });
        },
      });
    }
  }

  if (hasMoreColumns) {
    wells.left.push({
      placeholder: wells.left.length === 0 ? "y" : "+",
      canAdd: settings["graph._metric_filter"],
      onAdd: (column, { onChangeSettings }) => {
        addRawMetric(column, { settings, onChangeSettings });
      },
    });
    if (wells.bottom.length === 0) {
      wells.bottom.push({
        placeholder: "x",
        canAdd: settings["graph._dimension_filter"],
        onAdd: (column, { onChangeSettings }) => {
          addRawDimension(column, { settings, onChangeSettings });
        },
      });
    } else if (wells.bottom.length === 1) {
      wells.bottom.push({
        placeholder: "Series breakout",
        canAdd: settings["graph._dimension_filter"],
        onAdd: (column, { onChangeSettings }) => {
          addRawDimension(column, { settings, onChangeSettings });
        },
      });
    }
  }
  return wells;
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

function addSummarizedMetric() {}

function addBreakoutDimension() {}

function removeSummarizedMetric() {}

function removeBreakoutDimension() {}

async function switchToSummarized(
  index,
  agg,
  { series, query, settings, onChangeSettings, onChangeDatasetQuery },
) {
  const [{ data: { cols } }] = series;

  for (const [metricIndex, name] of settings["graph.metrics"].entries()) {
    const dimension = query.dimensionForColumn(_.findWhere(cols, { name }));
    if (dimension) {
      const aggregation = dimension.defaultAggregation();
      // set the aggregation to the chosen one for the selected metric
      if (metricIndex === index) {
        aggregation[0] = agg.short;
      }
      query = query.addAggregation(aggregation);
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
                : () => alert("nyi")
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
