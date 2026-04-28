import { useState } from "react";
import { t } from "ttag";

import type {
  MetricDimension,
  MetricOrMeasure,
  Timeline,
} from "metabase/explorations/types";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Pill,
  Stack,
  Text,
} from "metabase/ui";

import { AddMetricsModal } from "./AddMetricsModal";
import { AddTimelinesModal } from "./AddTimelinesModal";
import S from "./NewExplorationData.module.css";

export interface NewExplorationDataProps {
  metrics: MetricOrMeasure[];
  setMetrics: (metrics: MetricOrMeasure[]) => void;
  dimensions: MetricDimension[];
  setDimensions: (dimensions: MetricDimension[]) => void;
  timelines: Timeline[];
  setTimelines: (timelines: Timeline[]) => void;
}

export function NewExplorationData({
  metrics,
  setMetrics,
  dimensions,
  setDimensions,
  timelines,
  setTimelines,
}: NewExplorationDataProps) {
  const [isAddMetricsModalOpen, setIsAddMetricsModalOpen] = useState(false);
  const [isAddTimelinesModalOpen, setIsAddTimelinesModalOpen] = useState(false);

  return (
    <>
      <Stack
        w="30rem"
        h="100%"
        gap={0}
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
      >
        <Box flex={2} mih={0}>
          <NewExplorationSection
            title={t`Exploration data`}
            onOpenModal={() => setIsAddMetricsModalOpen(true)}
            ariaLabel={t`Add metrics and dimensions`}
          >
            {metrics.length > 0 || dimensions.length > 0 ? (
              <>
                <Text>{t`Metrics`}</Text>
                <PillList
                  items={metrics}
                  onRemove={(id) =>
                    setMetrics(metrics.filter((metric) => metric.id !== id))
                  }
                />
                <Text>{t`Dimensions`}</Text>
                <PillList
                  items={dimensions.map(dimensionToPillItem)}
                  onRemove={(id) =>
                    setDimensions(
                      dimensions.filter((dimension) => dimension.id !== id),
                    )
                  }
                />
              </>
            ) : (
              <Text py="sm" c="text-secondary">
                {t`Manually add metrics and dimensions to explore or ask for help from the agent.`}
              </Text>
            )}
          </NewExplorationSection>
        </Box>
        <Box flex={1} mih={0}>
          <NewExplorationSection
            title={t`Timelines`}
            onOpenModal={() => setIsAddTimelinesModalOpen(true)}
            ariaLabel={t`Add timelines`}
          >
            {timelines.length > 0 ? (
              <PillList
                items={timelines}
                onRemove={(id) =>
                  setTimelines(
                    timelines.filter((timeline) => timeline.id !== id),
                  )
                }
              />
            ) : (
              <Text py="sm" c="text-secondary">
                {t`Add timelines to help look for correlations in your data. You can ask the agent for timeline data you might not already have.`}
              </Text>
            )}
          </NewExplorationSection>
        </Box>
        <Button
          flex={"none"}
          mx="lg"
          my="md"
          size="sm"
          variant="filled"
        >{t`Start exploration`}</Button>
      </Stack>
      <AddMetricsModal
        opened={isAddMetricsModalOpen}
        onClose={() => setIsAddMetricsModalOpen(false)}
        metrics={metrics}
        setMetrics={setMetrics}
        dimensions={dimensions}
        setDimensions={setDimensions}
      />
      <AddTimelinesModal
        opened={isAddTimelinesModalOpen}
        onClose={() => setIsAddTimelinesModalOpen(false)}
        timelines={timelines}
        setTimelines={setTimelines}
      />
    </>
  );
}

interface NewExplorationSectionProps {
  title: string;
  ariaLabel: string;
  onOpenModal: () => void;
  children: React.ReactNode;
}

function NewExplorationSection({
  title,
  ariaLabel,
  onOpenModal,
  children,
}: NewExplorationSectionProps) {
  return (
    <Stack h="100%" px="md" pt="sm" className={S.section}>
      <Group justify="space-between" align="center">
        <Text size="lg" fw="bold">
          {title}
        </Text>
        <ActionIcon aria-label={ariaLabel} onClick={onOpenModal}>
          <Icon name="add" c="icon-primary" />
        </ActionIcon>
      </Group>
      {children}
    </Stack>
  );
}

interface PillItem {
  id: number | string;
  name: string;
}

function dimensionToPillItem(item: MetricDimension): PillItem {
  return {
    id: item.id,
    name: item["display-name"],
  };
}

interface PillListProps {
  items: PillItem[];
  onRemove: (id: number | string) => void;
}

function PillList({ items, onRemove }: PillListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Group mih="2rem" align="flex-start" gap="sm" className={S.pillList}>
      {items.map((item) => (
        <Pill
          key={item.id}
          withRemoveButton
          onRemove={() => onRemove(item.id)}
          bdrs="xl"
          bg="background-secondary"
          fw="normal"
          px="sm"
          py="xs"
          removeButtonProps={{
            mr: 0,
          }}
        >
          {item.name}
        </Pill>
      ))}
    </Group>
  );
}
