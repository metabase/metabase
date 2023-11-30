import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";

import type { NotebookStepUiComponentProps } from "../types";
import { ClauseStep } from "./ClauseStep";

const ExpressionStep = ({
  color,
  query,
  updateQuery,
  isLastOpened,
  reportTimezone,
  readOnly,
}: NotebookStepUiComponentProps): JSX.Element => {
  const items = Object.entries(query.expressions()).map(
    ([name, expression]) => ({ name, expression }),
  );

  return (
    <ClauseStep
      color={color}
      items={items}
      renderName={({ name }) => name}
      readOnly={readOnly}
      renderPopover={({ item }) => (
        <ExpressionWidget
          legacyQuery={query}
          name={item?.name}
          expression={item?.expression}
          withName
          onChangeExpression={(newName, newExpression) => {
            item?.expression
              ? updateQuery(
                  query.updateExpression(newName, newExpression, item.name),
                )
              : updateQuery(query.addExpression(newName, newExpression));
          }}
          reportTimezone={reportTimezone}
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={({ name }) => updateQuery(query.removeExpression(name))}
      withLegacyPopover
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ExpressionStep;
