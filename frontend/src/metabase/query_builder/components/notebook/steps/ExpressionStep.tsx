import React from "react";

import ExpressionWidget from "metabase/query_builder/components/expressions/ExpressionWidget";
import { NotebookStepUiComponentProps } from "metabase/query_builder/components/notebook/lib/steps.types";
import ClauseStep from "./ClauseStep";

type ExpressionStepProps = NotebookStepUiComponentProps;

const ExpressionStep = ({
  color,
  query,
  updateQuery,
  isLastOpened,
  reportTimezone,
}: ExpressionStepProps): JSX.Element => {
  const items = Object.entries(query.expressions()).map(
    ([name, expression]) => ({ name, expression }),
  );

  return (
    <ClauseStep
      color={color}
      items={items}
      renderName={({ name }) => name}
      renderPopover={item => (
        <ExpressionWidget
          query={query}
          name={item?.name}
          expression={item?.expression}
          onChangeExpression={(newName, newExpression) =>
            item?.expression
              ? updateQuery(
                  query.updateExpression(newName, newExpression, name),
                )
              : updateQuery(query.addExpression(newName, newExpression))
          }
          reportTimezone={reportTimezone}
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={({ name }) => updateQuery(query.removeExpression(name))}
    />
  );
};

export default ExpressionStep;
