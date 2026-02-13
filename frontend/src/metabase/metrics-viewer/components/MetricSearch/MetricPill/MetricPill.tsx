import { Fragment, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import {
  dataStudioMetric,
  dataStudioPublishedTableMeasure,
} from "metabase/lib/urls/data-studio";
import { metricQuestionUrl } from "metabase/lib/urls/models";
import { Box, Flex, Icon, Menu, Pill, Popover, Skeleton } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";
import { getDimensionIcon, getDimensionsByType } from "../../../utils/tabs";
import { MetricSearchDropdown } from "../MetricSearchDropdown";

import S from "./MetricPill.module.css";

const SELECTED_ITEM_STYLE: React.CSSProperties = {
  backgroundColor: "var(--mb-color-brand)",
  color: "var(--mb-color-text-primary-inverse)",
};

type MetricPillProps = {
  metric: SelectedMetric;
  colors?: string[];
  definitionEntry: MetricsViewerDefinitionEntry;
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSwap: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number, sourceType: "metric" | "measure") => void;
  onSetBreakout: (dimension: DimensionMetadata | undefined) => void;
  onOpen?: () => void;
};

export function MetricPill({
  metric,
  colors,
  definitionEntry,
  selectedMetricIds,
  selectedMeasureIds,
  onSwap,
  onRemove,
  onSetBreakout,
  onOpen,
}: MetricPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  const dimensions = useMemo(
    () => (definitionEntry.definition ? getDimensionsByType(definitionEntry.definition) : new Map()),
    [definitionEntry.definition],
  );

  const dimensionSections = useMemo(() => {
    const dims = [...dimensions.values()];
    const groups = new Map<
      string | undefined,
      { groupName: string; items: typeof dims }
    >();

    for (const dim of dims) {
      const groupId = dim.group?.id;
      const entry = groups.get(groupId);
      if (entry) {
        entry.items.push(dim);
      } else {
        groups.set(groupId, {
          groupName: dim.group?.displayName ?? "",
          items: [dim],
        });
      }
    }

    return [...groups.values()];
  }, [dimensions]);

  const { breakoutDimension } = definitionEntry;

  const handleSelect = useCallback(
    (newMetric: SelectedMetric) => {
      onSwap(metric, newMetric);
      setIsOpen(false);
    },
    [metric, onSwap],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleOpen = useCallback(() => {
    onOpen?.();
    setContextMenuOpen(false);
    setIsOpen(true);
  }, [onOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    setContextMenuOpen(true);
  }, []);

  const handleEditInDataStudio = useCallback(() => {
    if (metric.sourceType === "measure" && metric.tableId != null) {
      window.open(dataStudioPublishedTableMeasure(metric.tableId, metric.id), "_blank");
    } else {
      window.open(dataStudioMetric(metric.id), "_blank");
    }
    setContextMenuOpen(false);
  }, [metric]);

  const handleGoToMetric = useCallback(() => {
    window.open(metricQuestionUrl({ id: metric.id, name: metric.name }), "_blank");
    setContextMenuOpen(false);
  }, [metric]);

  return (
    <Box component="span" pos="relative" display="inline-flex">
      <Popover
        opened={isOpen}
        onChange={setIsOpen}
        position="bottom-start"
        shadow="md"
        withinPortal
        trapFocus
      >
        <Popover.Target>
          <Pill
            className={S.metricPill}
            c="text-primary"
            bd="1px solid var(--mb-color-border)"
            mih={32}
            px="sm"
            py="xs"
            fw="normal"
            withRemoveButton
            onRemove={() => {
              onRemove(metric.id, metric.sourceType);
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            onContextMenu={handleContextMenu}
            removeButtonProps={{
              mr: 0,
              "aria-label": metric.isLoading
                ? t`Remove metric`
                : t`Remove ${metric.name}`,
            }}
          >
            <Flex align="center" gap="xs">
              {metric.isLoading ? (
                <Skeleton mt="xs" w={70} h="1rem" />
              ) : (
                <>
                  <SourceColorIndicator
                    colors={colors}
                    fallbackIcon={metric.sourceType === "measure" ? "sum" : "metric"}
                  />
                  <span>{metric.name}</span>
                </>
              )}
            </Flex>
          </Pill>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <MetricSearchDropdown
            selectedMetricIds={selectedMetricIds}
            selectedMeasureIds={selectedMeasureIds}
            onSelect={handleSelect}
            onClose={handleClose}
            excludeMetricId={metric.id}
            showSearchInput
          />
        </Popover.Dropdown>
      </Popover>
      <Menu
        opened={contextMenuOpen}
        onChange={setContextMenuOpen}
        position="bottom-start"
        withinPortal
      >
        <Menu.Target>
          <Box
            component="span"
            pos="absolute"
            inset={0}
            className={S.menuTarget}
          />
        </Menu.Target>
        <Menu.Dropdown>
          {dimensions.size > 0 && (
            <>
              <Menu.Sub position="right-start">
                <Menu.Sub.Target>
                  <Menu.Sub.Item leftSection={<Icon name="arrow_split" />}>
                    {t`Break out`}
                  </Menu.Sub.Item>
                </Menu.Sub.Target>
                <Menu.Sub.Dropdown
                  w={260}
                  mah={420}
                  style={{ overflow: "auto" }}
                >
                  <Menu.Item onClick={() => onSetBreakout(undefined)}>
                    {t`None`}
                  </Menu.Item>
                  <Menu.Divider />
                  {dimensionSections.map(({ groupName, items }, idx) => (
                    <Fragment key={groupName || idx}>
                      {groupName && dimensionSections.length > 1 && (
                        <Menu.Label>{groupName}</Menu.Label>
                      )}
                      {items.map((dim) => {
                        const isSelected = breakoutDimension != null && LibMetric.isSameSource(dim.dimension, breakoutDimension);
                        return (
                          <Menu.Item
                            key={dim.name}
                            leftSection={<Icon name={getDimensionIcon(dim.dimension)} />}
                            onClick={() => onSetBreakout(dim.dimension)}
                            style={isSelected ? SELECTED_ITEM_STYLE : undefined}
                          >
                            {dim.displayName}
                          </Menu.Item>
                        );
                      })}
                    </Fragment>
                  ))}
                </Menu.Sub.Dropdown>
              </Menu.Sub>
              <Menu.Divider />
            </>
          )}
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            rightSection={<Icon name="external" />}
            onClick={handleEditInDataStudio}
          >
            {t`Edit in Data Studio`}
          </Menu.Item>
          {metric.sourceType === "metric" && (
            <Menu.Item
              leftSection={<Icon name="info" />}
              rightSection={<Icon name="external" />}
              onClick={handleGoToMetric}
            >
              {t`Go to metric home page`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
