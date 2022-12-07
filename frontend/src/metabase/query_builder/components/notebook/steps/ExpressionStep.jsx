/* eslint-disable react/prop-types */
import React from "react";

import ExpressionWidget from "metabase/query_builder/components/expressions/ExpressionWidget";
import ClauseStep from "./ClauseStep";

export default function ExpressionStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  return (
    <ClauseStep
      color={color}
      items={Object.entries(query.expressions())}
      renderName={([name, expression]) => name}
      renderPopover={([name, expression] = [], onClose) => (
        <ExpressionWidget
          query={query}
          name={name}
          expression={expression}
          onChangeExpression={(newName, newExpression) =>
            expression
              ? updateQuery(
                  query.updateExpression(newName, newExpression, name),
                )
              : updateQuery(query.addExpression(newName, newExpression))
          }
        />
      )}
      isLastOpened={isLastOpened}
      onRemove={([name, expression]) =>
        updateQuery(query.removeExpression(name))
      }
    />
  );
}
