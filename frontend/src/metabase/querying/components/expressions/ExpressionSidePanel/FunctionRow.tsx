import { getHelpText } from "metabase/querying/expressions";
import { Icon, NavLink } from "metabase/ui";
import type { Database, IconName } from "metabase-types/api";

import S from "./ExpressionSidePanel.module.css";
import type { SidePanelIconName } from "./content";
import type { SidePanelFunctionRow } from "./utils";

type FunctionRowProps = {
  row: SidePanelFunctionRow;
  database: Database | undefined;
  onOpen: (row: SidePanelFunctionRow) => void;
};

/**
 * A function in the docs panel: the app's NavLink, with the section's type
 * icon, the name, the description below it, and a chevron. Clicking it opens
 * the function's page.
 */
export function FunctionRow({ row, database, onOpen }: FunctionRowProps) {
  const description =
    database != null ? getHelpText(row.name, database)?.description : null;

  return (
    <NavLink
      component="button"
      type="button"
      role="button"
      variant="secondary"
      classNames={{
        root: S.functionLink,
        section: S.functionLinkSection,
        label: S.functionLinkLabel,
        description: S.functionLinkDescription,
      }}
      label={
        <>
          {row.displayName}
          {row.hint != null && <span className={S.hint}>{row.hint}</span>}
        </>
      }
      description={description != null ? toPlainText(description) : undefined}
      leftSection={<Icon name={FUNCTION_ROW_ICONS[row.icon]} />}
      rightSection={<Icon name="chevronright" />}
      // Unsupported functions stay clickable: their page says why.
      data-unsupported={row.isDisabled || undefined}
      onClick={() => onOpen(row)}
      data-testid="expression-side-panel-function"
    />
  );
}

/** The type icons of the sections, as in the Figma frames. */
const FUNCTION_ROW_ICONS: Record<SidePanelIconName, IconName> = {
  "function-general": "function",
  text: "string",
  date: "calendar",
  time: "clock",
  math: "int",
  conversion: "sync",
  convert: "sync",
  "table-column": "table",
  "table-row": "list",
};

// Descriptions are Markdown, with `$name` marking argument names. The list
// shows them as plain text; the function's page formats them.
function toPlainText(markdown: string) {
  return markdown.replace(/`\$?([^`]*)`/g, "$1");
}
