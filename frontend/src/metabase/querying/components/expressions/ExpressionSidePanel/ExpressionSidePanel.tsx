import cx from "classnames";
import {
  type ChangeEvent,
  Fragment,
  type MouseEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { hasRequiredFeature } from "metabase/databases";
import {
  findRelatedFunctions,
  getClauseDefinition,
} from "metabase/querying/expressions";
import {
  ActionIcon,
  Icon,
  ScrollArea,
  SegmentedControl,
  TextInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import S from "./ExpressionSidePanel.module.css";
import { FunctionDetail } from "./FunctionDetail";
import { FunctionRow } from "./FunctionRow";
import { SnippetRow } from "./SnippetRow";
import { type SidePanelTab, getTemplatesTabLabel } from "./content";
import {
  type SidePanelFunctionRow,
  type SidePanelRow,
  getSidePanelView,
} from "./utils";

/**
 * Opens the panel at a function's page, by its clause name, or at the list.
 * A new `id` asks again, also for the same function.
 */
export type ExpressionSidePanelFunctionRequest = {
  functionName?: string;
  id: number;
};

export type ExpressionSidePanelProps = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  reportTimezone?: string;
  functionRequest?: ExpressionSidePanelFunctionRequest;
  onClose: () => void;
  onTemplateClick: (code: string) => void;
};

/**
 * The docs for the expression editor, in two tabs: every function, and
 * ready-made snippets. The second tab is named after what the editor builds:
 * snippets for a custom column, conditions for a filter, aggregations for a
 * summary. Clicking a function opens its page, with a way back to the list.
 */
export function ExpressionSidePanel({
  expressionMode,
  query,
  reportTimezone,
  functionRequest,
  onClose,
  onTemplateClick,
}: ExpressionSidePanelProps) {
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const [tab, setTab] = useState<SidePanelTab>("functions");
  const [search, setSearch] = useState("");
  // The function whose page shows, by its clause name.
  const [openFunctionName, setOpenFunctionName] = useState(
    functionRequest?.functionName,
  );
  const [requestId, setRequestId] = useState(functionRequest?.id);
  if (functionRequest != null && functionRequest.id !== requestId) {
    setRequestId(functionRequest.id);
    setOpenFunctionName(functionRequest.functionName);
  }
  const openFunction = getOpenFunction(openFunctionName, database);

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
      { value: "functions" as const, label: t`Functions` },
      {
        value: "templates" as const,
        label: getTemplatesTabLabel(expressionMode),
      },
    ],
    [expressionMode],
  );

  const closeButton = (
    <ActionIcon
      variant="subtle"
      color="neutral"
      size="sm"
      aria-label={t`Close`}
      onClick={onClose}
    >
      <Icon name="close" size={12} />
    </ActionIcon>
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
      {/* The list stays mounted under a function's page, so that going back
          finds it scrolled where it was. */}
      <div className={S.page} aria-hidden={openFunction != null}>
        <div className={S.header}>
          <h4 className={S.title}>{t`List of expressions`}</h4>
          {closeButton}
        </div>

        <div className={S.controls}>
          <TextInput
            value={search}
            placeholder={t`Search`}
            leftSection={<Icon name="search" size={12} />}
            aria-label={t`Search the list of expressions`}
            autoFocus
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSearch(event.target.value)
            }
          />
          <SegmentedControl
            data={tabs}
            value={tab}
            onChange={setTab}
            fullWidth
          />
        </div>

        <ScrollArea
          className={S.scrollArea}
          classNames={{ content: S.scrollContent }}
          type="hover"
          scrollbars="y"
        >
          {sections.length === 0 && (
            <div className={S.empty}>{t`Didn't find any results`}</div>
          )}
          {sections.map((section, index) => (
            <Fragment key={section.name}>
              {index > 0 && <div className={S.divider} />}
              <section className={S.section}>
                <h5 className={S.sectionTitle}>{section.name}</h5>
                {section.blocks.map((rows, blockIndex) => (
                  <div
                    key={blockIndex}
                    className={cx(S.block, {
                      [S.functionBlock]: tab === "functions",
                    })}
                  >
                    {rows.map((row) => (
                      <Row
                        key={row.key}
                        row={row}
                        database={database}
                        onFunctionOpen={(row) => setOpenFunctionName(row.name)}
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

      {openFunction != null && database != null && (
        <div className={S.detailPage}>
          <div className={S.header}>
            <div className={S.headerStart}>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={t`Back to the list`}
                onClick={() => setOpenFunctionName(undefined)}
              >
                <Icon name="arrow_left" size={12} />
              </ActionIcon>
              <h4 className={S.title}>{openFunction.displayName}</h4>
            </div>
            {closeButton}
          </div>
          <ScrollArea
            className={S.detailScrollArea}
            type="hover"
            scrollbars="y"
            data-selectable
          >
            <FunctionDetail
              name={openFunction.name}
              database={database}
              reportTimezone={reportTimezone}
              isDisabled={openFunction.isDisabled}
            />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/** A function to show the page of, when the panel knows it. */
function getOpenFunction(name: string | undefined, database?: Database) {
  const clause = name != null ? getClauseDefinition(name) : undefined;
  if (clause == null || database == null) {
    return null;
  }
  return {
    name: clause.name,
    displayName: clause.displayName,
    isDisabled: !hasRequiredFeature(database, clause.requiresFeature),
  };
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
// The text of a function's page can still be selected, to copy an example.
function handlePanelMouseDown(event: MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  const target = event.target;
  const canFocus =
    target instanceof HTMLInputElement ||
    (target instanceof Element && target.closest("[data-selectable]") != null);
  if (!canFocus) {
    event.preventDefault();
  }
}

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

function Row({
  row,
  database,
  onFunctionOpen,
  onTemplateClick,
}: {
  row: SidePanelRow;
  database: Database | undefined;
  onFunctionOpen: (row: SidePanelFunctionRow) => void;
  onTemplateClick: (code: string) => void;
}) {
  if (row.type === "function") {
    return (
      <FunctionRow row={row} database={database} onOpen={onFunctionOpen} />
    );
  }
  return <SnippetRow row={row} onInsert={onTemplateClick} />;
}
