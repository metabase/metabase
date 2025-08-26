import { useMemo } from "react";

import { Accordion, Icon, Stack, Text } from "metabase/ui";

import { useScrollListItemIntoView } from "../../hooks/use-scroll-list-item-into-view";
import type { EmbeddingHubStep, EmbeddingHubStepId } from "../../types";

import AccordionS from "./EmbeddingHubAccordion.module.css";
import S from "./EmbeddingHubChecklist.module.css";
import { EmbeddingHubStepActions } from "./EmbeddingHubStepActions";
import { EmbeddingHubVideo } from "./VideoTutorial";

interface EmbeddingHubChecklistProps {
  steps: EmbeddingHubStep[];

  defaultOpenStep?: EmbeddingHubStepId;
  completedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
  onModalAction?: (modalType: "add-data" | "new-dashboard") => void;
}

export const EmbeddingHubChecklist = ({
  steps,

  defaultOpenStep,
  completedSteps = {},
  onModalAction,
}: EmbeddingHubChecklistProps) => {
  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  const { listItemRefs, scrollListItemIntoView } =
    useScrollListItemIntoView(stepIds);

  const renderStepIcon = (step: EmbeddingHubStep) => {
    const isCompleted = completedSteps[step.id];

    if (isCompleted) {
      return <Icon name="check" c="var(--mb-color-success)" />;
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

        return (
          <Accordion.Item
            key={step.id}
            value={step.id}
            data-testid={`${step.id}-item`}
            ref={listItemRefs[step.id]}
          >
            <Accordion.Control
              icon={renderStepIcon(step)}
              className={isCompleted ? S.completedControl : undefined}
            >
              {step.title}
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

                <EmbeddingHubStepActions
                  step={step}
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
