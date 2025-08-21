import AccordionS from "metabase/home/components/Onboarding/OnboardingAccordion.module.css";
import { Accordion, Icon, Stack, Text } from "metabase/ui";

import { useScrollAccordionItemIntoView } from "../../hooks/use-scroll-accordion-item";
import type { EmbeddingHubStep, EmbeddingHubStepId } from "../../types";

import S from "./EmbeddingHubChecklist.module.css";
import { EmbeddingHubStepActions } from "./EmbeddingHubStepActions";

interface EmbeddingHubChecklistProps {
  steps: EmbeddingHubStep[];

  defaultOpenStep?: EmbeddingHubStepId;
  completedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
}

export const EmbeddingHubChecklist = ({
  steps,

  defaultOpenStep,
  completedSteps = {},
}: EmbeddingHubChecklistProps) => {
  const { accordionItemRefs, scrollAccordionItemIntoView } =
    useScrollAccordionItemIntoView(steps.map((step) => step.id));

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
      onChange={scrollAccordionItemIntoView}
    >
      {steps.map((step) => {
        const isCompleted = completedSteps[step.id] ?? false;

        return (
          <Accordion.Item
            key={step.id}
            value={step.id}
            data-testid={`${step.id}-item`}
            ref={accordionItemRefs[step.id]}
          >
            <Accordion.Control
              icon={renderStepIcon(step)}
              className={isCompleted ? S.completedControl : S.incompleteControl}
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

                <Text>{step.description}</Text>

                <EmbeddingHubStepActions step={step} />
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
