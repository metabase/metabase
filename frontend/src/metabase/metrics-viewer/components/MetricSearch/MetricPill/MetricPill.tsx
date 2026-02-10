import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  dataStudioMetric,
  dataStudioPublishedTableMeasure,
} from "metabase/lib/urls/data-studio";
import { metricQuestionUrl } from "metabase/lib/urls/models";
import { Box, Flex, Icon, Menu, Pill, Popover, Skeleton } from "metabase/ui";

import { MetricSearchDropdown } from "../MetricSearchDropdown";
import type { SelectedMetric } from "../../../types/viewer-state";

import S from "./MetricPill.module.css";

type MetricPillProps = {
  metric: SelectedMetric;
  color?: string;
  selectedMetricIds: Set<number>;
  selectedMeasureIds: Set<number>;
  onSwap: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number) => void;
  onOpen?: () => void;
};

export function MetricPill({
  metric,
  color,
  selectedMetricIds,
  selectedMeasureIds,
  onSwap,
  onRemove,
  onOpen,
}: MetricPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

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
              onRemove(metric.id);
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
                  <Icon
                    name={metric.sourceType === "measure" ? "sum" : "metric"}
                    size={14}
                    c={color as Parameters<typeof Icon>[0]["c"]}
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
