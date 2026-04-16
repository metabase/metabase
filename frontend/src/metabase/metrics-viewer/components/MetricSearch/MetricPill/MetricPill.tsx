import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import { Box, Flex, Icon, Menu, Pill, Popover, Skeleton } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { ProjectionClause } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricsViewerDefinitionEntry,
  SelectedMetric,
} from "../../../types/viewer-state";
import { getEntryBreakout } from "../../../utils/definition-entries";
import { getDimensionsByType } from "../../../utils/tabs";
import { BreakoutDimensionPicker } from "../../BreakoutDimensionPicker";
import { MetricSearchDropdown } from "../MetricSearchDropdown";

import S from "./MetricPill.module.css";

type PillPopoverState = "closed" | "menu" | "swap" | "breakout-picker";

type MetricPillProps = {
  metric: SelectedMetric;
  colors?: string[];
  definitionEntry: MetricsViewerDefinitionEntry;
  onSwap: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  onRemove: (metricId: number, sourceType: "metric" | "measure") => void;
  onSetBreakout: (dimension: ProjectionClause | undefined) => void;
  onOpen?: () => void;
};

export function MetricPill({
  metric,
  colors,
  definitionEntry,
  onSwap,
  onRemove,
  onSetBreakout,
  onOpen,
}: MetricPillProps) {
  const [popoverState, setPopoverState] = useState<PillPopoverState>("closed");

  const { selectedMetricIds, selectedMeasureIds } = useMemo(() => {
    if (metric.sourceType === "metric") {
      return {
        selectedMetricIds: new Set<number>([metric.id]),
        selectedMeasureIds: new Set<number>(),
      };
    }
    if (metric.sourceType === "measure") {
      return {
        selectedMetricIds: new Set<number>(),
        selectedMeasureIds: new Set<number>([metric.id]),
      };
    }

    return {
      selectedMetricIds: new Set<number>(),
      selectedMeasureIds: new Set<number>(),
    };
  }, [metric.id, metric.sourceType]);

  const dimensions = useMemo(
    () =>
      definitionEntry.definition
        ? getDimensionsByType(definitionEntry.definition)
        : new Map(),
    [definitionEntry.definition],
  );

  const { definition } = definitionEntry;

  const breakoutDimension = useMemo(
    () => getEntryBreakout(definitionEntry),
    [definitionEntry],
  );

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
      setPopoverState("closed");
    },
    [metric, onSwap],
  );

  const handleClose = useCallback(() => {
    setPopoverState("closed");
  }, []);

  const handleOpen = useCallback(() => {
    onOpen?.();
    setPopoverState("menu");
  }, [onOpen]);

  const handleOpenReplace = useCallback(() => {
    setPopoverState("swap");
  }, []);

  const handleOpenBreakoutPicker = useCallback(() => {
    setPopoverState("breakout-picker");
  }, []);

  const handleRemoveBreakout = useCallback(() => {
    onSetBreakout(undefined);
    setPopoverState("closed");
  }, [onSetBreakout]);

  return (
    <Box component="span" pos="relative" display="inline-flex">
      <Popover
        opened={popoverState === "swap"}
        onChange={(opened) => {
          if (!opened) {
            setPopoverState("closed");
          }
        }}
        position="bottom-start"
        shadow="md"
        withinPortal
        trapFocus
      >
        <Popover.Target>
          <Pill
            className={S.metricPill}
            c="text-primary"
            h="2rem"
            px="sm"
            py="xs"
            fw={600}
            withRemoveButton
            onRemove={() => {
              onRemove(metric.id, metric.sourceType);
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            removeButtonProps={{
              mr: 0,
              "aria-label": metric.name
                ? t`Remove ${metric.name}`
                : t`Remove metric`,
            }}
            data-testid="metrics-viewer-search-pill"
          >
            <Flex align="center" gap="xs">
              {metric.isLoading ? (
                <Skeleton mt="xs" w="4.5rem" h="1rem" />
              ) : (
                <>
                  <SourceColorIndicator
                    colors={colors}
                    fallbackIcon={
                      metric.sourceType === "measure" ? "ruler" : "metric"
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
            excludeMetric={{
              id: metric.id,
              sourceType: metric.sourceType,
            }}
            showSearchInput
          />
        </Popover.Dropdown>
      </Popover>
      <Menu
        opened={popoverState === "menu"}
        onChange={(opened) => {
          if (!opened) {
            setPopoverState((prev) => (prev === "menu" ? "closed" : prev));
          }
        }}
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
            leftSection={<Icon name="sync" />}
            onClick={handleOpenReplace}
          >
            {t`Replace`}
          </Menu.Item>
          {dimensions.size > 0 && definition && (
            <>
              {breakoutDimension && (
                <Menu.Item
                  leftSection={<Icon name="close" />}
                  onClick={handleRemoveBreakout}
                >
                  {t`Remove breakout`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="arrow_split" />}
                onClick={handleOpenBreakoutPicker}
              >
                {breakoutDimension ? t`Change breakout` : t`Break out`}
              </Menu.Item>
            </>
          )}
          {metric.sourceType === "metric" &&
            dimensions.size > 0 &&
            definition && <Menu.Divider role="separator" />}
          {metric.sourceType === "metric" && (
            <Menu.Item
              leftSection={<Icon name="info" />}
              rightSection={<Icon name="external" />}
              component={ForwardRefLink}
              to={Urls.metricQuestionUrl({
                id: metric.id,
                name: metric.name ?? undefined,
              })}
            >
              {t`Go to metric home page`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      {definition && (
        <Popover
          opened={popoverState === "breakout-picker"}
          onChange={(opened) => {
            if (!opened) {
              setPopoverState("closed");
            }
          }}
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
              onClose={handleClose}
            />
          </Popover.Dropdown>
        </Popover>
      )}
    </Box>
  );
}
