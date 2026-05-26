import { useCallback } from "react";
import { t } from "ttag";

import {
  trackMetricsViewerDimensionTabRemoved,
  trackMetricsViewerDimensionTabSwitched,
} from "metabase/metrics-viewer/analytics";
import type { TabInfo } from "metabase/metrics-viewer/utils/tabs";
import { ActionIcon, Icon, Skeleton, Tabs } from "metabase/ui";

import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "../../types/viewer-state";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../../utils/dimension-picker";

import { AddDimensionPopover } from "./AddDimensionPopover";
import S from "./MetricsViewerTabs.module.css";

type MetricsViewerTabsProps = {
  tabs: MetricsViewerTabState[];
  activeTabId: string | null;
  isLoading?: boolean;
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  onTabChange: (tabId: string) => void;
  onAddTab: (tabInfo: TabInfo) => void;
  onRemoveTab: (tabId: string) => void;
};

export function MetricsViewerTabs({
  tabs,
  activeTabId,
  isLoading,
  availableDimensions,
  sourceOrder,
  sourceDataById,
  onTabChange,
  onAddTab,
  onRemoveTab,
}: MetricsViewerTabsProps) {
  const handleRemoveTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onRemoveTab(tabId);
      trackMetricsViewerDimensionTabRemoved();
    },
    [onRemoveTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      onTabChange(value);
      trackMetricsViewerDimensionTabSwitched();
    },
    [onTabChange],
  );

  const hasSharedDimensions = availableDimensions.shared.length > 0;
  const hasAnySourceDimensions = sourceOrder.some(
    (sourceId) => (availableDimensions.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableDimensions = hasSharedDimensions || hasAnySourceDimensions;
  const hasMultipleSources = sourceOrder.length > 1;

  if (tabs.length <= 1 && !hasAvailableDimensions) {
    return null;
  }

  const canAddScalarTab = !tabs.some((tab) => tab.type === "scalar");

  return (
    <Tabs
      value={activeTabId}
      onChange={(value) => value && handleTabChange(value)}
      w="auto"
    >
      <Tabs.List className={S.list} justify="flex-start">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            pl="lg"
            aria-label={tab.label ?? undefined}
            className={S.tab}
          >
            {isLoading || tab.label == null ? (
              <Skeleton display="inline-block" w="4.5rem" h="1em" />
            ) : (
              tab.label
            )}
            <ActionIcon
              className={S.closeButton}
              size="xs"
              variant="subtle"
              ml="xs"
              aria-label={
                tab.label != null ? t`Remove ${tab.label} tab` : undefined
              }
              onClick={(e) => handleRemoveTab(e, tab.id)}
            >
              <Icon name="close" size={10} />
            </ActionIcon>
          </Tabs.Tab>
        ))}
        {hasAvailableDimensions && (
          <AddDimensionPopover
            availableDimensions={availableDimensions}
            sourceOrder={sourceOrder}
            sourceDataById={sourceDataById}
            hasMultipleSources={hasMultipleSources}
            onAddTab={onAddTab}
            canAddScalarTab={canAddScalarTab}
          />
        )}
      </Tabs.List>
    </Tabs>
  );
}
