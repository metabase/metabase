import cx from "classnames";
import {
  type ChangeEvent,
  Children,
  Fragment,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { Markdown } from "metabase/common/components/Markdown";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  findRelatedFunctions,
  getHelpText,
} from "metabase/querying/expressions";
import {
  ActionIcon,
  HoverCard,
  Icon,
  ScrollArea,
  SegmentedControl,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { HighlightExpressionSource } from "../HighlightExpression";

import S from "./ExpressionSidePanel.module.css";
import {
  type SidePanelIconName,
  type SidePanelTab,
  getTemplatesTabLabel,
} from "./content";
import { SIDE_PANEL_ICONS } from "./icons";
import { type SidePanelRow, getSidePanelView } from "./utils";

const ICON_SIZE = 16;

const MARKDOWN_COMPONENTS = {
  code(props: { children: ReactNode }) {
    const children = Children.toArray(props.children);
    if (!children.every((child) => typeof child === "string")) {
      return <code>{children}</code>;
    }

    const source = children.join("").replace(/^\$/, "");
    return <HighlightExpressionSource inline expression={source} />;
  },
};

export type ExpressionSidePanelProps = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  reportTimezone?: string;
  onClose: () => void;
  /** Called with the clause name of a function. */
  onFunctionClick: (name: string) => void;
  onTemplateClick: (code: string) => void;
};

/**
 * Templates and functions for the expression editor, in two tabs. The first
 * tab is named after what the editor builds: templates for a custom column,
 * conditions for a filter, aggregations for a summary.
 */
export function ExpressionSidePanel({
  expressionMode,
  query,
  reportTimezone,
  onClose,
  onFunctionClick,
  onTemplateClick,
}: ExpressionSidePanelProps) {
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const [tab, setTab] = useState<SidePanelTab>("templates");
  const [search, setSearch] = useState("");

  const relatedNames = useRelatedFunctions({
    expressionMode,
    database,
    search,
  });
  const sections = useMemo(
    () =>
      getSidePanelView({ expressionMode, tab, database, search, relatedNames }),
    [expressionMode, tab, database, search, relatedNames],
  );

  const tabs = useMemo(
    () => [
      {
        value: "templates" as const,
        label: getTemplatesTabLabel(expressionMode),
      },
      { value: "functions" as const, label: t`Functions` },
    ],
    [expressionMode],
  );

  return (
    <div
      className={S.panel}
      data-testid="expression-side-panel"
      // The panel sits outside the popover of a filter or summary editor, so
      // its clicks must not count as clicks outside it, which close it.
      data-ignore-editor-clicks="true"
      onMouseDown={handlePanelMouseDown}
      onTouchStart={stopPropagation}
    >
      <div className={S.header}>
        <h4 className={S.title}>{t`Custom expressions`}</h4>
        <ActionIcon
          variant="subtle"
          color="neutral"
          size="sm"
          aria-label={t`Close`}
          onClick={onClose}
        >
          <Icon name="close" size={12} />
        </ActionIcon>
      </div>

      <div className={S.controls}>
        <TextInput
          value={search}
          placeholder={t`Search`}
          leftSection={<Icon name="search" size={12} />}
          aria-label={t`Search expressions`}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setSearch(event.target.value)
          }
        />
        <SegmentedControl data={tabs} value={tab} onChange={setTab} fullWidth />
      </div>

      <ScrollArea className={S.scrollArea} type="hover" scrollbars="y">
        {sections.length === 0 && (
          <div className={S.empty}>{t`Didn't find any results`}</div>
        )}
        {sections.map((section, index) => (
          <Fragment key={section.name}>
            {index > 0 && <div className={S.divider} />}
            <section className={S.section}>
              <h5 className={S.sectionTitle}>{section.name}</h5>
              {section.blocks.map((rows, blockIndex) => (
                <div key={blockIndex} className={S.block}>
                  {rows.map((row) => (
                    <Row
                      key={row.key}
                      row={row}
                      database={database}
                      reportTimezone={reportTimezone}
                      onFunctionClick={onFunctionClick}
                      onTemplateClick={onTemplateClick}
                    />
                  ))}
                </div>
              ))}
            </section>
          </Fragment>
        ))}
      </ScrollArea>
    </div>
  );
}

// A pause in typing before the search by meaning, which asks a model.
const RELATED_DELAY = 300;

/**
 * The functions whose meaning matches the search, with the on-device model
 * that autocomplete also uses. Empty when the browser has no such model.
 */
function useRelatedFunctions({
  expressionMode,
  database,
  search,
}: {
  expressionMode: Lib.ExpressionMode;
  database: Database | undefined;
  search: string;
}) {
  const debouncedSearch = useDebouncedValue(search, RELATED_DELAY);
  const [related, setRelated] = useState<{ search: string; names: string[] }>({
    search: "",
    names: [],
  });

  useEffect(() => {
    const controller = new AbortController();
    findRelatedFunctions(
      { expressionMode, database },
      debouncedSearch,
      controller.signal,
    ).then((names) => {
      if (!controller.signal.aborted) {
        setRelated({ search: debouncedSearch, names });
      }
    });
    return () => controller.abort();
  }, [expressionMode, database, debouncedSearch]);

  // Results for an earlier search would show unrelated functions.
  return related.search === search ? related.names : NO_NAMES;
}

const NO_NAMES: string[] = [];

// Clicking a row must not take focus away from the expression being typed.
function handlePanelMouseDown(event: MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  if (!(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
  }
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

function Row({
  row,
  database,
  reportTimezone,
  onFunctionClick,
  onTemplateClick,
}: {
  row: SidePanelRow;
  database: Database | undefined;
  reportTimezone?: string;
  onFunctionClick: (name: string) => void;
  onTemplateClick: (code: string) => void;
}) {
  if (row.type === "template") {
    return (
      <UnstyledButton
        className={S.row}
        onClick={() => onTemplateClick(row.code)}
        data-testid="expression-side-panel-template"
      >
        <PanelIcon name={row.icon} />
        <span className={S.label}>{row.name}</span>
        {row.hint != null && <span className={S.hint}>{row.hint}</span>}
      </UnstyledButton>
    );
  }

  return (
    <HoverCard
      position="left-start"
      offset={8}
      openDelay={150}
      disabled={!database}
    >
      <HoverCard.Target>
        <UnstyledButton
          className={cx(S.row, { [S.disabled]: row.isDisabled })}
          aria-disabled={row.isDisabled}
          onClick={row.isDisabled ? undefined : () => onFunctionClick(row.name)}
          data-testid="expression-side-panel-function"
        >
          <PanelIcon name={row.icon} />
          <span className={S.functionName}>
            {row.displayName}
            <span className={S.parentheses}>()</span>
          </span>
          {row.hint != null && <span className={S.hint}>{row.hint}</span>}
        </UnstyledButton>
      </HoverCard.Target>
      <HoverCard.Dropdown
        className={S.details}
        data-testid="expression-side-panel-details"
      >
        {row.isDisabled && t`This database doesn't support ${row.displayName}.`}
        {!row.isDisabled && database && (
          <FunctionDetails
            name={row.name}
            database={database}
            reportTimezone={reportTimezone}
          />
        )}
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function PanelIcon({ name }: { name: SidePanelIconName }) {
  const IconComponent = SIDE_PANEL_ICONS[name];
  return (
    <IconComponent
      className={S.icon}
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden
    />
  );
}

function FunctionDetails({
  name,
  database,
  reportTimezone,
}: {
  name: string;
  database: Database;
  reportTimezone?: string;
}) {
  const helpText = getHelpText(name, database, reportTimezone);
  if (!helpText) {
    return null;
  }

  const args = helpText.args.map((arg) => arg.name).join(", ");

  return (
    <>
      <div className={S.signature}>{`${helpText.displayName}(${args})`}</div>
      <Markdown components={MARKDOWN_COMPONENTS}>
        {helpText.description}
      </Markdown>
    </>
  );
}
