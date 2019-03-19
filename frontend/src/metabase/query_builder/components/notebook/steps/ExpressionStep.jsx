import React from "react";

import ClauseStep from "./ClauseStep";

import ExpressionWidget from "metabase/query_builder/components/expressions/ExpressionWidget";

export default function ExpressionStep({ color, query, ...props }) {
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
              ? query.updateExpression(newName, newExpression, name).update()
              : query.addExpression(newName, newExpression).update()
          }
        />
      )}
      onRemove={([name, expression]) => query.removeExpression(name).update()}
    />
  );
}
