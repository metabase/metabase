/* @flow */

import React from "react";

import _ from "underscore";
import { t } from "c-3po";

import Query, { AggregationClause, NamedClause } from "metabase/lib/query";
import { getAggregator } from "metabase/lib/schema_metadata";
import { format } from "metabase/lib/expressions/formatter";

import FieldName from "./FieldName";

import type { Aggregation } from "metabase/meta/types/Query";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
  aggregation: Aggregation,
  query: StructuredQuery,
};

const AggregationName = ({ aggregation, query }: Props) => {
  const tableMetadata = query.tableMetadata();
  const customFields = query.expressions();
  if (!tableMetadata) {
    return null;
  }
  return NamedClause.isNamed(aggregation) ? (
    <NamedAggregation aggregation={aggregation} />
  ) : AggregationClause.isCustom(aggregation) ? (
    <CustomAggregation
      aggregation={aggregation}
      tableMetadata={tableMetadata}
      customFields={customFields}
    />
  ) : AggregationClause.isMetric(aggregation) ? (
    <MetricAggregation
      aggregation={aggregation}
      tableMetadata={tableMetadata}
    />
  ) : (
    <StandardAggregation
      aggregation={aggregation}
      tableMetadata={tableMetadata}
      customFields={customFields}
    />
  );
};

const NamedAggregation = ({ aggregation }) => (
  <span>{NamedClause.getName(aggregation)}</span>
);

const CustomAggregation = ({ aggregation, tableMetadata, customFields }) => (
  <span>{format(aggregation, { tableMetadata, customFields })}</span>
);

const MetricAggregation = ({ aggregation, tableMetadata }) => {
  const metricId = AggregationClause.getMetric(aggregation);
  const selectedMetric = _.findWhere(tableMetadata.metrics, { id: metricId });
  if (selectedMetric) {
    return <span>{selectedMetric.name.replace(" of ...", "")}</span>;
  } else {
    return <span>{t`Invalid`}</span>;
  }
};

const StandardAggregation = ({ aggregation, tableMetadata, customFields }) => {
  const fieldId = AggregationClause.getField(aggregation);

  let selectedAggregation = getAggregator(
    AggregationClause.getOperator(aggregation),
  );
  // if this table doesn't support the selected aggregation, prompt the user to select a different one
  if (
    selectedAggregation &&
    _.findWhere(tableMetadata.aggregation_options, {
      short: selectedAggregation.short,
    })
  ) {
    return (
      <span>
        {selectedAggregation.name.replace(" of ...", "")}
        {fieldId && <span className="text-bold"> {t`of`} </span>}
        {fieldId && (
          <FieldName
            field={fieldId}
            tableMetadata={tableMetadata}
            fieldOptions={Query.getFieldOptions(tableMetadata.fields, true)}
            customFieldOptions={customFields}
          />
        )}
      </span>
    );
  } else {
    return <span>{t`Invalid`}</span>;
  }
};

export default AggregationName;
