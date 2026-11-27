import { Icon, UnstyledButton } from "metabase/ui";

import S from "./ExpressionSidePanel.module.css";
import type { SidePanelTemplateRow } from "./utils";

type SnippetRowProps = {
  row: SidePanelTemplateRow;
  onInsert: (code: string) => void;
};

/**
 * A snippet in the docs panel, styled after the SQL editor's snippets: the
 * snippet icon and the name, and the description below. On hover the icon
 * turns into "insert" and the name into a link color. Clicking it inserts
 * the snippet into the expression.
 */
export function SnippetRow({ row, onInsert }: SnippetRowProps) {
  return (
    <UnstyledButton
      className={S.snippet}
      onClick={() => onInsert(row.code)}
      data-testid="expression-side-panel-template"
    >
      <span className={S.snippetHeader}>
        <span className={S.snippetIcon}>
          <Icon name="snippet" className={S.snippetIconDefault} />
          <Icon name="arrow_left_to_line" className={S.snippetIconHover} />
        </span>
        <span className={S.snippetName}>{row.name}</span>
        {row.hint != null && <span className={S.hint}>{row.hint}</span>}
      </span>
      <span className={S.snippetDescription}>{row.description}</span>
    </UnstyledButton>
  );
}
