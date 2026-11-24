import cx from "classnames";

import { getHelpText } from "metabase/querying/expressions";
import { Icon, UnstyledButton } from "metabase/ui";
import type { Database } from "metabase-types/api";

import S from "./ExpressionSidePanel.module.css";
import type { SidePanelFunctionRow } from "./utils";

type FunctionRowProps = {
  row: SidePanelFunctionRow;
  database: Database | undefined;
  onOpen: (row: SidePanelFunctionRow) => void;
};

/**
 * A function in the docs panel: its icon and name, and its description
 * below. Clicking it opens the function's page.
 */
export function FunctionRow({ row, database, onOpen }: FunctionRowProps) {
  const description =
    database != null ? getHelpText(row.name, database)?.description : null;

  return (
    <UnstyledButton
      className={cx(S.function, { [S.disabled]: row.isDisabled })}
      onClick={() => onOpen(row)}
      data-testid="expression-side-panel-function"
    >
      <span className={S.functionHeader}>
        <span className={S.functionIcon}>
          <Icon name="function" size={10} />
        </span>
        <span className={S.functionName}>
          {row.displayName}
          <span className={S.parentheses}>()</span>
        </span>
        {row.hint != null && <span className={S.hint}>{row.hint}</span>}
      </span>
      {description != null && (
        <span className={S.functionDescription}>
          {toPlainText(description)}
        </span>
      )}
    </UnstyledButton>
  );
}

// Descriptions are Markdown, with `$name` marking argument names. The list
// shows them as plain text; the function's page formats them.
function toPlainText(markdown: string) {
  return markdown.replace(/`\$?([^`]*)`/g, "$1");
}
