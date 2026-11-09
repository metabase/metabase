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
import { HoverCard, ScrollArea, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { HighlightExpressionSource } from "../HighlightExpression";

import S from "./ExpressionSidePanel.module.css";
import type {
  SidePanelGroupId,
  SidePanelIconName,
  SidePanelTemplate,
  SidePanelTool,
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
  reportTimezone?: string;
  onClauseClick?: (name: string) => void;
  onTemplateClick?: (code: string) => void;
};

export function ExpressionSidePanel({
  expressionMode,
  query,
  reportTimezone,
  onClauseClick,
  onTemplateClick,
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

  const { tools, popular, groups } = useMemo(
    () => getSidePanelSections({ expressionMode, database, search }),
    [expressionMode, database, search],
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
                {tools.map((tool) => (
                  <ActionRow key={tool.name} item={tool} />
                ))}
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
  onClick,
}: {
  item: SidePanelTool | SidePanelTemplate;
  onClick?: () => void;
}) {
  return (
    <UnstyledButton
      className={S.row}
      onClick={onClick}
      data-testid="expression-side-panel-action"
    >
      <PanelIcon name={item.icon} />
      <span className={S.label}>{item.name}</span>
    </UnstyledButton>
  );
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
