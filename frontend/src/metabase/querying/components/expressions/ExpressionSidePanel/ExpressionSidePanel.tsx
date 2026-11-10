import cx from "classnames";
import {
  type ChangeEvent,
  Children,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Markdown } from "metabase/common/components/Markdown";
import { getHelpText } from "metabase/querying/expressions";
import {
  HoverCard,
  Popover,
  ScrollArea,
  Title,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../../analytics";
import { CombineColumns, hasCombinations } from "../CombineColumns";
import { ExtractColumn, hasExtractions } from "../ExtractColumn";
import { HighlightExpressionSource } from "../HighlightExpression";

import S from "./ExpressionSidePanel.module.css";
import type {
  SidePanelGroupId,
  SidePanelIconName,
  SidePanelTemplate,
  SidePanelTool,
  SidePanelToolAction,
} from "./content";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SIDE_PANEL_ICONS,
  SearchIcon,
} from "./icons";
import {
  type SidePanelFunction,
  type SidePanelGroupView,
  getSidePanelSections,
} from "./utils";

const ICON_SIZE = 16;
const TOOL_POPOVER_WIDTH = 472;

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

type ExpressionSidePanelProps = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  reportTimezone?: string;
  onClauseClick?: (name: string) => void;
  onTemplateClick?: (code: string) => void;
  /** Called with the expression a tool built, and a name for it. */
  onToolSubmit?: (clause: Lib.ExpressionClause, name: string) => void;
};

export function ExpressionSidePanel({
  expressionMode,
  query,
  stageIndex,
  availableColumns,
  reportTimezone,
  onClauseClick,
  onTemplateClick,
  onToolSubmit,
}: ExpressionSidePanelProps) {
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<ReadonlySet<SidePanelGroupId>>(
    () => new Set(),
  );
  const isSearching = search.trim() !== "";

  const {
    tools: allTools,
    popular,
    groups,
  } = useMemo(
    () => getSidePanelSections({ expressionMode, database, search }),
    [expressionMode, database, search],
  );

  // Like the old editor buttons, a tool only shows when there's something
  // to use it on.
  const tools = useMemo(
    () =>
      allTools.filter(
        (tool) =>
          (tool.action !== "combine" || hasCombinations(availableColumns)) &&
          (tool.action !== "extract" ||
            hasExtractions(query, availableColumns)),
      ),
    [allTools, query, availableColumns],
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value),
    [],
  );

  const handleToggleGroup = useCallback((id: SidePanelGroupId) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Clicking the panel must not take focus away from the expression being typed.
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
    }
  }, []);

  return (
    <div
      className={S.panel}
      data-testid="expression-side-panel"
      onMouseDown={handleMouseDown}
    >
      <label className={S.searchBar}>
        <SearchIcon
          className={S.themedIcon}
          width={ICON_SIZE}
          height={ICON_SIZE}
        />
        <input
          className={S.searchInput}
          placeholder={t`Search expressions`}
          value={search}
          onChange={handleSearchChange}
        />
      </label>

      <ScrollArea className={S.scrollArea} type="hover" scrollbars="y">
        {!isSearching && (
          <>
            <div className={S.divider} />
            <section className={S.tools}>
              <Subheading>{t`Tools`}</Subheading>
              <div className={S.list}>
                {tools.map((tool) =>
                  tool.action ? (
                    <ToolPopover
                      key={tool.name}
                      tool={tool}
                      action={tool.action}
                      query={query}
                      stageIndex={stageIndex}
                      availableColumns={availableColumns}
                      onSubmit={onToolSubmit}
                    />
                  ) : (
                    <ActionRow key={tool.name} item={tool} />
                  ),
                )}
              </div>
            </section>
            <section className={S.popular}>
              <Subheading>{t`Popular`}</Subheading>
              <div className={S.list}>
                {popular.map((fn) => (
                  <FunctionRow
                    key={fn.name}
                    fn={fn}
                    database={database}
                    reportTimezone={reportTimezone}
                    onClauseClick={onClauseClick}
                  />
                ))}
              </div>
            </section>
            <div className={S.divider} />
          </>
        )}

        {isSearching && groups.length === 0 && (
          <EmptyState message={t`Didn't find any results`} icon="search" />
        )}

        {groups.map((group) => (
          <Group
            key={group.id}
            group={group}
            isOpen={isSearching || openGroups.has(group.id)}
            database={database}
            reportTimezone={reportTimezone}
            onToggle={handleToggleGroup}
            onClauseClick={onClauseClick}
            onTemplateClick={onTemplateClick}
          />
        ))}
      </ScrollArea>
    </div>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return <div className={S.subheading}>{children}</div>;
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

function ActionRow({
  item,
  isActive,
  onClick,
}: {
  item: SidePanelTool | SidePanelTemplate;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <UnstyledButton
      className={cx(S.row, { [S.active]: isActive })}
      onClick={onClick}
      data-testid="expression-side-panel-action"
    >
      <PanelIcon name={item.icon} />
      <span className={S.label}>{item.name}</span>
    </UnstyledButton>
  );
}

function ToolPopover({
  tool,
  action,
  query,
  stageIndex,
  availableColumns,
  onSubmit,
}: {
  tool: SidePanelTool;
  action: SidePanelToolAction;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  onSubmit?: (clause: Lib.ExpressionClause, name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCombineSubmit = (name: string, clause: Lib.ExpressionClause) => {
    trackColumnCombineViaShortcut(query);
    setIsOpen(false);
    onSubmit?.(clause, name);
  };

  const handleExtractSubmit = (
    clause: Lib.ExpressionClause,
    name: string,
    extraction: Lib.ColumnExtraction,
  ) => {
    trackColumnExtractViaShortcut(query, stageIndex, extraction);
    setIsOpen(false);
    onSubmit?.(clause, name);
  };

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="right-start"
      offset={8}
    >
      <Popover.Target>
        <div>
          <ActionRow
            item={tool}
            isActive={isOpen}
            onClick={() => setIsOpen((isOpen) => !isOpen)}
          />
        </div>
      </Popover.Target>
      <Popover.Dropdown
        className={S.toolPopover}
        data-testid="expression-side-panel-tool-popover"
        // Let clicks in the popover behave normally: the panel itself keeps
        // focus in the editor by cancelling them.
        onMouseDown={stopPropagation}
      >
        {action === "combine" ? (
          <>
            <Title className={S.toolTitle} order={6}>
              {t`Select columns to combine`}
            </Title>
            <CombineColumns
              query={query}
              stageIndex={stageIndex}
              availableColumns={availableColumns}
              width={TOOL_POPOVER_WIDTH}
              onSubmit={handleCombineSubmit}
            />
          </>
        ) : (
          <ExtractColumn
            query={query}
            stageIndex={stageIndex}
            availableColumns={availableColumns}
            onSubmit={handleExtractSubmit}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

function FunctionRow({
  fn,
  database,
  reportTimezone,
  onClauseClick,
}: {
  fn: SidePanelFunction;
  database: Database | undefined;
  reportTimezone?: string;
  onClauseClick?: (name: string) => void;
}) {
  return (
    <HoverCard
      position="right-start"
      offset={8}
      openDelay={150}
      disabled={!database}
    >
      <HoverCard.Target>
        <UnstyledButton
          className={cx(S.row, { [S.disabled]: fn.isDisabled })}
          aria-disabled={fn.isDisabled}
          onClick={fn.isDisabled ? undefined : () => onClauseClick?.(fn.name)}
          data-testid="expression-side-panel-function"
        >
          <PanelIcon name={fn.icon} />
          <span className={S.functionName}>
            {fn.displayName}
            <span className={S.parentheses}>()</span>
          </span>
        </UnstyledButton>
      </HoverCard.Target>
      <HoverCard.Dropdown
        className={S.details}
        data-testid="expression-side-panel-details"
      >
        {fn.isDisabled && t`This database doesn't support ${fn.displayName}.`}
        {!fn.isDisabled && database && (
          <FunctionDetails
            name={fn.name}
            database={database}
            reportTimezone={reportTimezone}
          />
        )}
      </HoverCard.Dropdown>
    </HoverCard>
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

function Group({
  group,
  isOpen,
  database,
  reportTimezone,
  onToggle,
  onClauseClick,
  onTemplateClick,
}: {
  group: SidePanelGroupView;
  isOpen: boolean;
  database: Database | undefined;
  reportTimezone?: string;
  onToggle: (id: SidePanelGroupId) => void;
  onClauseClick?: (name: string) => void;
  onTemplateClick?: (code: string) => void;
}) {
  const ChevronIcon = isOpen ? ChevronUpIcon : ChevronDownIcon;

  return (
    <>
      <UnstyledButton
        className={S.groupHeader}
        aria-expanded={isOpen}
        onClick={() => onToggle(group.id)}
      >
        <ChevronIcon
          className={S.themedIcon}
          width={ICON_SIZE}
          height={ICON_SIZE}
          aria-hidden
        />
        <span className={S.label}>{group.name}</span>
      </UnstyledButton>
      {isOpen && (
        <div className={S.groupBody}>
          {group.templates.length > 0 && (
            <section>
              <Subheading>{t`Templates`}</Subheading>
              <div className={S.list}>
                {group.templates.map((template) => (
                  <ActionRow
                    key={template.name}
                    item={template}
                    onClick={() => onTemplateClick?.(template.code)}
                  />
                ))}
              </div>
            </section>
          )}
          {group.functions.length > 0 && (
            <section>
              <Subheading>{group.functionsLabel}</Subheading>
              <div className={S.list}>
                {group.functions.map((fn) => (
                  <FunctionRow
                    key={fn.name}
                    fn={fn}
                    database={database}
                    reportTimezone={reportTimezone}
                    onClauseClick={onClauseClick}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
