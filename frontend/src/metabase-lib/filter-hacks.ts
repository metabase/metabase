/**
 * these are essentially hacks to ease the transition from MLv1 to MLv2
 * you should not rely on these outside that limited scope
 */
import * as ML from "metabase-lib";
import type Filter from "./queries/structured/Filter";

export const getMlv2Column = ({ query, fieldId, stageIndex = -1 }) => {
  const columns = ML.filterableColumns(query, stageIndex);


  return columns.find(column => {
    // this feels like a hack that is completely against the spirit of the MLv2 API
    const [operator] = ML.filterableColumnOperators(column);
    const { args: [ fieldRef ]} = ML.externalOp(ML.filterClause(operator, column));
    const { args: [ extractedFieldId ]} = ML.externalOp(fieldRef);

    return fieldId === extractedFieldId;
  });
}

export const getOperatorsMap = ({ query, column, stageIndex = -1 }) => {
  const operators = ML.filterableColumnOperators(column);
  return Object.fromEntries(
    operators.map((operator) => [
      ML.displayInfo(query, stageIndex, operator).shortName,
      operator,
    ]),
  );
}

export const getMlv2FilterClause = (filter: Filter, stageIndex = -1) => {
  const mlv2Query = filter.query().question()._getMLv2Query();

  const fieldId = Array.isArray(filter?.field()?.id)
    ? filter?.field()?.id?.[1] // aggregation dimension
    : filter?.field()?.id; // field dimension

  const column = getMlv2Column({ query: mlv2Query, fieldId, stageIndex });

  const operatorsMap = getOperatorsMap({ query: mlv2Query, column, stageIndex });

  const operator = operatorsMap[filter.operatorName()];

  const filterClause = filter.isValid() ? ML.filterClause(
    operator,
    column,
    ...filter.arguments(),
  ) : undefined;

  return { filterClause, column, query: mlv2Query };
}
