import { useCallback } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tabs } from "metabase/ui";

import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "../../types/viewer-state";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../../utils/tabs";
import { ALL_TAB_ID } from "../../constants";

import { AddDimensionPopover } from "./AddDimensionPopover";
import S from "./MetricsViewerTabs.module.css";

type MetricsViewerTabsProps = {
  tabs: MetricsViewerTabState[];
  activeTabId: string;
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  onTabChange: (tabId: string) => void;
  onAddTab: (dimensionName: string) => void;
  onRemoveTab: (tabId: string) => void;
};

export function MetricsViewerTabs({
  tabs,
  activeTabId,
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
    },
    [onRemoveTab],
  );

  const hasSharedDimensions = availableDimensions.shared.length > 0;
  const hasAnySourceDimensions = sourceOrder.some(
    (sourceId) => (availableDimensions.bySource[sourceId]?.length ?? 0) > 0,
  );
  const hasAvailableDimensions = hasSharedDimensions || hasAnySourceDimensions;
  const hasMultipleSources = sourceOrder.length > 1;

  const showAllTab = tabs.length > 1;

  if (tabs.length <= 1 && !hasAvailableDimensions) {
    return null;
  }

  return (
    <Tabs
      value={activeTabId}
      onChange={(value) => value && onTabChange(value)}
      w="auto"
    >
      <Tabs.List className={S.list} justify="flex-start">
        {showAllTab && (
          <Tabs.Tab
            value={ALL_TAB_ID}
            aria-label={t`All dimensions`}
            className={S.allTab}
            px="md"
          >
            <Icon name="grid_2x2" size={16} />
          </Tabs.Tab>
        )}
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} px="md">
            {tab.label}
            <ActionIcon
              size="xs"
              variant="subtle"
              ml={4}
              aria-label={t`Remove ${tab.label} tab`}
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
          />
        )}
      </Tabs.List>
    </Tabs>
  );
}
