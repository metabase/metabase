import { useState } from "react";
import { t } from "ttag";

import type {
  MetricDimension,
  MetricOrMeasure,
  Timeline,
} from "metabase/explorations/types";
import { ActionIcon, Button, Group, Icon, Stack, Text } from "metabase/ui";

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
        gap={0}
        bg="background-primary"
        bd="1px solid border"
        bdrs="md"
      >
        <NewExplorationSection
          title={t`Exploration data`}
          onOpenModal={() => setIsAddMetricsModalOpen(true)}
          ariaLabel={t`Add metrics and dimensions`}
          placeholder={t`Manually add metrics and dimensions to explore or ask for help from the agent.`}
        ></NewExplorationSection>
        <NewExplorationSection
          title={t`Timelines`}
          onOpenModal={() => setIsAddTimelinesModalOpen(true)}
          ariaLabel={t`Add timelines`}
          placeholder={t`Add timelines to help look for correlations in your data. You can ask the agent for timeline data you might not already have.`}
        ></NewExplorationSection>
        <Button
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
  children?: React.ReactNode;
  placeholder?: React.ReactNode;
}

function NewExplorationSection({
  title,
  ariaLabel,
  onOpenModal,
  children,
  placeholder,
}: NewExplorationSectionProps) {
  return (
    <Stack className={S.section}>
      <Group px="md" py="sm" justify="space-between" align="center">
        <Text fw="bold">{title}</Text>
        <ActionIcon aria-label={ariaLabel} onClick={onOpenModal}>
          <Icon name="add" c="icon-primary" />
        </ActionIcon>
      </Group>
      {children}
      {!children && placeholder && (
        <Text h="10rem" px="md" py="sm" c="text-secondary">
          {placeholder}
        </Text>
      )}
    </Stack>
  );
}
