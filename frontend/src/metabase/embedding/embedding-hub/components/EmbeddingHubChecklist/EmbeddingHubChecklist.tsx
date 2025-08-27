import cx from "classnames";
import { useMemo } from "react";

import {
  Accordion,
  Alert,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
} from "metabase/ui";

import { useScrollListItemIntoView } from "../../hooks/use-scroll-list-item-into-view";
import type {
  EmbeddingHubModalToTrigger,
  EmbeddingHubStep,
  EmbeddingHubStepId,
} from "../../types";

import AccordionS from "./EmbeddingHubAccordion.module.css";
import S from "./EmbeddingHubChecklist.module.css";
import { EmbeddingHubStepActions } from "./EmbeddingHubStepActions";
import { EmbeddingHubVideo } from "./VideoTutorial";

interface EmbeddingHubChecklistProps {
  steps: EmbeddingHubStep[];
  onModalAction?: (modal: EmbeddingHubModalToTrigger) => void;

  defaultOpenStep?: EmbeddingHubStepId;
  completedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
  lockedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
}

export const EmbeddingHubChecklist = ({
  steps,
  onModalAction,

  defaultOpenStep,
  completedSteps = {},
  lockedSteps = {},
}: EmbeddingHubChecklistProps) => {
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  const { listItemRefs, scrollListItemIntoView } =
    useScrollListItemIntoView(stepIds);

  const renderStepIcon = (step: EmbeddingHubStep) => {
    if (completedSteps[step.id]) {
      return <Icon name="check" c="var(--mb-color-success)" />;
    }

    if (lockedSteps[step.id]) {
      return <Icon name={step.icon} c="var(--mb-color-text-light)" />;
    }

    return <Icon name={step.icon} />;
  };

  return (
    <Accordion
      defaultValue={defaultOpenStep ?? steps[0]?.id}
      classNames={accordionClassNames}
      onChange={scrollListItemIntoView}
    >
      {steps.map((step) => {
        const isCompleted = completedSteps[step.id] ?? false;
        const isLocked = lockedSteps[step.id] ?? false;

        return (
          <Accordion.Item
            key={step.id}
            value={step.id}
            data-testid={`${step.id}-item`}
            ref={listItemRefs[step.id]}
          >
            <Accordion.Control
              icon={renderStepIcon(step)}
              className={cx(
                isCompleted && S.completedControl,
                isLocked && S.lockedControl,
              )}
            >
              <Group gap="sm" c="var(--mb-color-text-medium)">
                <span>{step.title}</span>

                {isLocked && (
                  <Icon name="lock" c="var(--mb-color-text-light)" size={14} />
                )}
              </Group>
            </Accordion.Control>

            <Accordion.Panel>
              <Stack gap="lg">
                {step.image && (
                  <img
                    alt={step.image.alt}
                    className={AccordionS.image}
                    loading="lazy"
                    src={step.image.src}
                    srcSet={step.image.srcSet}
                    width="100%"
                  />
                )}

                {step.video && (
                  <EmbeddingHubVideo
                    id={step.video.id}
                    trackingId={step.video.trackingId}
                    title={step.video.title}
                  />
                )}

                <Text>{step.description}</Text>

                {step.infoAlert?.type === "always" && (
                  <InfoAlert message={step.infoAlert.message} />
                )}

                {isLocked && step.infoAlert?.type === "locked" && (
                  <InfoAlert icon="lock" message={step.infoAlert.message} />
                )}

                <EmbeddingHubStepActions
                  step={step}
                  isLocked={isLocked}
                  onModalAction={onModalAction}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
};

const accordionClassNames = {
  chevron: AccordionS.chevron,
  content: AccordionS.content,
  control: AccordionS.control,
  icon: AccordionS.icon,
  item: AccordionS.item,
  label: AccordionS.label,
};

const InfoAlert = ({ message, icon }: { message: string; icon?: IconName }) => (
  <Alert
    variant="info"
    px="md"
    py="sm"
    bg="var(--mb-color-bg-light)"
    bd="1px solid var(--mb-color-border)"
  >
    <Group gap="xs">
      {icon && <Icon name={icon} c="var(--mb-color-text-secondary)" />}

      <Text c="var(--mb-color-text-secondary)">{message}</Text>
    </Group>
  </Alert>
);
