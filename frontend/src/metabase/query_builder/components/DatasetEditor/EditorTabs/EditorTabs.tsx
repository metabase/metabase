import cx from "classnames";
import type { CSSProperties } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import type { DatasetEditorTab } from "metabase-types/store";

import EditorTabsS from "./EditorTabs.module.css";

type Props = {
  currentTab: string;
  disabledQuery: boolean;
  disabledColumns: boolean;
  onChange: (optionId: DatasetEditorTab) => void;
};

export function EditorTabs({
  currentTab,
  disabledQuery,
  disabledColumns,
  onChange,
}: Props) {
  return (
    <ul
      className={EditorTabsS.TabBar}
      style={
        {
          "--active-tab-color": "var(--mb-color-brand-dark)",
          "--inactive-tab-color":
            "color-mix(in srgb, var(--mb-color-brand-dark) 30%, transparent )",
        } as CSSProperties
      }
    >
      <li>
        <label
          className={cx(EditorTabsS.Tab, {
            [EditorTabsS.active]: currentTab === "query",
            [EditorTabsS.inactive]: currentTab !== "query",
            [EditorTabsS.disabled]: disabledQuery,
          })}
          htmlFor="editor-tabs-query"
        >
          <Icon name="sql" mr="10px" />
          <input
            className={EditorTabsS.RadioInput}
            type="radio"
            id="editor-tabs-query"
            name="editor-tabs"
            value="query"
            checked={currentTab === "query"}
            disabled={disabledQuery}
            onChange={() => {
              onChange("query");
            }}
            data-testid="editor-tabs-query"
          />
          <span data-testid="editor-tabs-query-name">{t`Query`}</span>
        </label>
      </li>

      <li>
        <label
          className={cx(EditorTabsS.Tab, {
            [EditorTabsS.active]: currentTab === "columns",
            [EditorTabsS.inactive]: currentTab !== "columns",
            [EditorTabsS.disabled]: disabledColumns,
          })}
          htmlFor="editor-tabs-columns"
        >
          <Icon name="notebook" mr="10px" />
          <input
            type="radio"
            className={EditorTabsS.RadioInput}
            id="editor-tabs-columns"
            name="editor-tabs"
            value="columns"
            checked={currentTab === "columns"}
            onChange={() => {
              onChange("columns");
            }}
            disabled={disabledColumns}
            data-testid="editor-tabs-columns"
          />
          <span data-testid="editor-tabs-columns-name">{t`Columns`}</span>
        </label>
      </li>
      <li>
        <label
          className={cx(EditorTabsS.Tab, {
            [EditorTabsS.active]: currentTab === "metadata",
            [EditorTabsS.inactive]: currentTab !== "metadata",
          })}
          htmlFor="editor-tabs-metadata"
        >
          <Icon name="gear" mr="10px" />
          <input
            type="radio"
            className={EditorTabsS.RadioInput}
            id="editor-tabs-metadata"
            name="editor-tabs"
            value="metadata"
            checked={currentTab === "metadata"}
            onChange={() => {
              onChange("metadata");
            }}
            data-testid="editor-tabs-metadata"
          />
          <span data-testid="editor-tabs-metadata-name">{t`Settings`}</span>
        </label>
      </li>
    </ul>
  );
}
