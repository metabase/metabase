import cx from "classnames";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import EditorTabsS from "./EditorTabs.module.css";

type Props = {
  currentTab: string;
  disabledMetadata: boolean;
  onChange: (optionId: string) => void;
};

export function EditorTabs({ currentTab, disabledMetadata, onChange }: Props) {
  return (
    <ul className={EditorTabsS.TabBar}>
      <li>
        <label
          className={cx(EditorTabsS.Tab, {
            [EditorTabsS.active]: currentTab === "query",
            [EditorTabsS.inactive]: currentTab !== "query",
          })}
          htmlFor="editor-tabs-query"
        >
          <Icon name="notebook" />
          <input
            className={EditorTabsS.RadioInput}
            type="radio"
            id="editor-tabs-query"
            name="editor-tabs"
            value="query"
            checked={currentTab === "query"}
            onChange={() => {
              onChange("query");
            }}
          />
          <span data-testid="editor-tabs-query-name">{t`Query`}</span>
        </label>
      </li>

      <li>
        <label
          className={cx(EditorTabsS.Tab, {
            [EditorTabsS.active]: currentTab === "metadata",
            [EditorTabsS.inactive]: currentTab !== "metadata",
            [EditorTabsS.disabled]: disabledMetadata,
          })}
          htmlFor="editor-tabs-metadata"
        >
          <Icon name="notebook" />
          <input
            className={EditorTabsS.RadioInput}
            id="editor-tabs-metadata"
            name="editor-tabs"
            value="metadata"
            checked={currentTab === "metadata"}
            onChange={() => {
              onChange("metadata");
            }}
            disabled={disabledMetadata}
            data-testid="editor-tabs-metadata"
          />
          <span data-testid="editor-tabs-metadata-name">{t`Metadata`}</span>
        </label>
      </li>
    </ul>
  );
}
