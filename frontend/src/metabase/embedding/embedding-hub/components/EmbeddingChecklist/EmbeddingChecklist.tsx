import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Accordion, Button, Group, Icon, Stack, Text } from "metabase/ui";

import { useScrollAccordionItemIntoView } from "../../hooks/use-scroll-accordion-item";
import type { EmbeddingHubStep, EmbeddingHubStepId } from "../../types";

import S from "./EmbeddingChecklist.module.css";

interface EmbeddingChecklistProps {
  steps: EmbeddingHubStep[];
  completedSteps?: Record<EmbeddingHubStepId, boolean>;
  defaultOpenStep?: EmbeddingHubStepId;
}

const accordionClassNames = {
  chevron: S.chevron,
  content: S.content,
  control: S.control,
  icon: S.icon,
  item: S.item,
  label: S.label,
};

export const EmbeddingChecklist = ({
  steps,
  completedSteps = {} as Record<EmbeddingHubStepId, boolean>,
  defaultOpenStep,
}: EmbeddingChecklistProps) => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isAdmin = useSelector(getUserIsAdmin);

  const { accordionItemRefs, scrollAccordionItemIntoView } =
    useScrollAccordionItemIntoView(steps.map((step) => step.id));

  const renderStepIcon = (step: EmbeddingHubStep) => {
    const isCompleted = completedSteps[step.id];

    if (isCompleted) {
      return <Icon name="check" c="var(--mb-color-success)" />;
    }

    return <Icon name={step.icon as any} />;
  };

  const renderStepActions = (step: EmbeddingHubStep) => {
    if (!step.actions?.length) {
      return null;
    }

    const visibleActions = step.actions.filter((action) => {
      if (action.adminOnly && !isAdmin) {
        return false;
      }

      if (action.showWhenMetabaseLinksEnabled && !showMetabaseLinks) {
        return false;
      }

      return true;
    });

    if (visibleActions.length === 0) {
      return null;
    }

    return (
      <Group gap="sm" data-testid={`${step.id}-cta`}>
        {visibleActions.map((action, index) =>
          action.href ? (
            <ExternalLink key={index} href={action.href}>
              <Button variant={action.variant || "outline"}>
                {action.label}
              </Button>
            </ExternalLink>
          ) : action.to ? (
            <Link key={index} to={action.to}>
              <Button variant={action.variant || "outline"}>
                {action.label}
              </Button>
            </Link>
          ) : null,
        )}
      </Group>
    );
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
            data-completed={isCompleted}
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
                    className={S.image}
                    loading="lazy"
                    src={step.image.src}
                    srcSet={step.image.srcSet}
                    width="100%"
                  />
                )}

                <Text>
                  {step.description.replace(
                    /\$\{applicationName\}/g,
                    applicationName,
                  )}
                </Text>

                {renderStepActions(step)}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
};
