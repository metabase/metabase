import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import {
  dataStudioMetric,
  dataStudioPublishedTableMeasure,
} from "metabase/lib/urls/data-studio";
import { metricQuestionUrl } from "metabase/lib/urls/models";
import { Box, Flex, Icon, Menu, Pill, Popover, Skeleton } from "metabase/ui";
import type { ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";
import { getDimensionsByType } from "../../../utils/tabs";
import { BreakoutDimensionPicker } from "../../BreakoutDimensionPicker";
import { MetricSearchDropdown } from "../MetricSearchDropdown";

import S from "./MetricPill.module.css";

type MetricPillProps = {
  metric: SelectedMetric;
  colors?: string[];
  definitionEntry: MetricsViewerDefinitionEntry;
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSwap: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number, sourceType: "metric" | "measure") => void;
  onSetBreakout: (dimension: ProjectionClause | undefined) => void;
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
  const [breakoutPickerOpen, setBreakoutPickerOpen] = useState(false);

  const dimensions = useMemo(
    () =>
      definitionEntry.definition
        ? getDimensionsByType(definitionEntry.definition)
        : new Map(),
    [definitionEntry.definition],
  );

  const { breakoutDimension, definition } = definitionEntry;

  const breakoutDimensionName = useMemo(() => {
    if (!breakoutDimension || !definition) {
      return null;
    }
    const rawDim = LibMetric.projectionDimension(definition, breakoutDimension);
    if (!rawDim) {
      return null;
    }
    return LibMetric.displayInfo(definition, rawDim).name ?? null;
  }, [breakoutDimension, definition]);

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
      window.open(
        dataStudioPublishedTableMeasure(metric.tableId, metric.id),
        "_blank",
      );
    } else {
      window.open(dataStudioMetric(metric.id), "_blank");
    }
    setContextMenuOpen(false);
  }, [metric]);

  const handleGoToMetric = useCallback(() => {
    window.open(
      metricQuestionUrl({ id: metric.id, name: metric.name }),
      "_blank",
    );
    setContextMenuOpen(false);
  }, [metric]);

  const handleOpenBreakoutPicker = useCallback(() => {
    setContextMenuOpen(false);
    setBreakoutPickerOpen(true);
  }, []);

  const handleCloseBreakoutPicker = useCallback(() => {
    setBreakoutPickerOpen(false);
  }, []);

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
                    fallbackIcon={
                      metric.sourceType === "measure" ? "sum" : "metric"
                    }
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
          {dimensions.size > 0 && definition && (
            <>
              <Menu.Item
                leftSection={<Icon name="arrow_split" />}
                onClick={handleOpenBreakoutPicker}
              >
                {t`Break out`}
              </Menu.Item>
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
      {definition && (
        <Popover
          opened={breakoutPickerOpen}
          onChange={setBreakoutPickerOpen}
          position="bottom-start"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <Box
              component="span"
              pos="absolute"
              inset={0}
              className={S.menuTarget}
            />
          </Popover.Target>
          <Popover.Dropdown p={0}>
            <BreakoutDimensionPicker
              definition={definition}
              currentBreakoutDimension={breakoutDimension}
              currentBreakoutDimensionName={breakoutDimensionName}
              onSelect={onSetBreakout}
              onClose={handleCloseBreakoutPicker}
            />
          </Popover.Dropdown>
        </Popover>
      )}
    </Box>
  );
}
