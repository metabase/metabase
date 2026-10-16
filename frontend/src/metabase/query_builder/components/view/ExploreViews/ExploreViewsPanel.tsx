import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { automagicDashboardsApi, skipToken } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { editSummary } from "metabase/redux/query-builder";
import { Box, Flex, Icon, Loader, Text, UnstyledButton } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { IconName } from "metabase-types/api";

import { useExploreUpdate } from "../ExploreBar/use-explore-update";

import S from "./ExploreViewsPanel.module.css";
import {
  getSourceKey,
  getXrayEntries,
  syncViews,
  withSuggestions,
} from "./view-entries";
import {
  type ExploreViewEntry,
  getSnapshotQuestion,
  getViewKey,
  setViewsState,
  useExploreViews,
} from "./views-store";

type ExploreViewsPanelProps = {
  question: Question;
};

/**
 * Independent views of the same data, side by side with the result: the records, a custom
 * summary, views changed this session (saveable), and interesting cuts found by X-ray.
 */
export function ExploreViewsPanel({ question }: ExploreViewsPanelProps) {
  const dispatch = useDispatch();
  const updateExploreQuestion = useExploreUpdate();
  const views = useExploreViews();
  const sourceKey = getSourceKey(question);
  const xray = useXraySuggestions(question, sourceKey);

  useEffect(() => {
    setViewsState((state) => syncViews(state, question));
  }, [question]);

  const handleSelect = (entry: ExploreViewEntry) => {
    if (entry.key === getViewKey(question)) {
      setViewsState((state) => ({ ...state, activeId: entry.id }));
      return;
    }
    setViewsState((state) => ({ ...state, pendingId: entry.id }));
    updateExploreQuestion(
      question,
      getSnapshotQuestion(question, entry.snapshot),
    );
  };

  const records = views.entries.filter((entry) => entry.kind === "records");
  const session = views.entries.filter((entry) => entry.kind === "session");
  const suggestions = views.entries.filter(
    (entry) => entry.kind === "suggested",
  );
  const sections = useMemo(() => groupBySection(suggestions), [suggestions]);

  return (
    <Box className={S.panel} data-testid="explore-views-panel">
      <Text className={S.panelTitle}>{t`Views`}</Text>
      {records.map((entry) => (
        <ViewItem
          key={entry.id}
          icon="table"
          title={entry.title}
          isActive={entry.id === views.activeId}
          onClick={() => handleSelect(entry)}
        />
      ))}
      <ViewItem
        icon="pivot_table"
        title={t`Custom summary`}
        isActive={false}
        onClick={() => dispatch(editSummary())}
      />

      <Box className={S.divider} />

      {session.length > 0 && (
        <Box mb="md">
          <Text className={S.groupTitle}>{t`This session`}</Text>
          {session.map((entry) => (
            <ViewItem
              key={entry.id}
              icon={getIconForVisualizationType(entry.snapshot.display).name}
              title={entry.title}
              subtitle={getSessionSubtitle(entry)}
              badge={entry.savedCardId == null ? t`Unsaved` : undefined}
              isActive={entry.id === views.activeId}
              onClick={() => handleSelect(entry)}
            />
          ))}
        </Box>
      )}

      <Flex align="center" gap="xs" className={S.groupTitle}>
        <Icon name="bolt" size={12} />
        <span>{t`Suggested by X-ray`}</span>
      </Flex>
      {xray.isLoading && (
        <Flex align="center" gap="sm" px="sm" py="xs">
          <Loader size="xs" />
          <Text size="sm" c="text-secondary">
            {t`Looking for interesting cuts…`}
          </Text>
        </Flex>
      )}
      {xray.isError && (
        <Text size="sm" c="text-secondary" px="sm">
          {t`X-ray couldn't look at this data.`}
        </Text>
      )}
      {sections.map(({ section, entries }) => (
        <Box key={section ?? "none"} mb="sm">
          {section && <Text className={S.sectionTitle}>{section}</Text>}
          {entries.map((entry) => (
            <ViewItem
              key={entry.id}
              icon={getIconForVisualizationType(entry.snapshot.display).name}
              title={entry.title}
              isActive={entry.id === views.activeId}
              onClick={() => handleSelect(entry)}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function getSessionSubtitle(entry: ExploreViewEntry): string | undefined {
  if (entry.savedCardId != null) {
    return t`Saved`;
  }
  return entry.basedOn ? t`From ${entry.basedOn}` : undefined;
}

function groupBySection(entries: ExploreViewEntry[]) {
  return entries.reduce<
    { section: string | undefined; entries: ExploreViewEntry[] }[]
  >((groups, entry) => {
    const last = groups.at(-1);
    if (last && last.section === entry.section) {
      last.entries.push(entry);
      return groups;
    }
    return [...groups, { section: entry.section, entries: [entry] }];
  }, []);
}

/** Loads the X-ray of the source table or question and adds its cards as suggested views. */
function useXraySuggestions(question: Question, sourceKey: string | null) {
  const sourceId = Lib.sourceTableOrCardId(question.query());
  const cardId =
    typeof sourceId === "string"
      ? getQuestionIdFromVirtualTableId(sourceId)
      : null;
  const subPath =
    cardId != null
      ? `question/${cardId}`
      : typeof sourceId === "number"
        ? `table/${sourceId}`
        : null;
  const { data, isLoading, isError } =
    automagicDashboardsApi.endpoints.getXrayDashboard.useQuery(
      subPath != null ? { subPath } : skipToken,
    );

  useEffect(() => {
    if (data == null) {
      return;
    }
    setViewsState((state) =>
      state.sourceKey === sourceKey
        ? withSuggestions(state, getXrayEntries(question, data))
        : state,
    );
    // only when the X-ray or the source changes; the question itself changes all the time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sourceKey]);

  return { isLoading, isError };
}

type ViewItemProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string;
  isActive: boolean;
  onClick: () => void;
};

function ViewItem({
  icon,
  title,
  subtitle,
  badge,
  isActive,
  onClick,
}: ViewItemProps) {
  return (
    <UnstyledButton
      className={cx(S.item, { [S.itemActive]: isActive })}
      aria-current={isActive}
      onClick={onClick}
    >
      <Icon name={icon} className={S.itemIcon} />
      <Box miw={0} flex={1}>
        <Text className={S.itemTitle} lineClamp={2}>
          {title}
        </Text>
        {subtitle && (
          <Text className={S.itemSubtitle} truncate>
            {subtitle}
          </Text>
        )}
      </Box>
      {badge && <span className={S.badge}>{badge}</span>}
    </UnstyledButton>
  );
}
