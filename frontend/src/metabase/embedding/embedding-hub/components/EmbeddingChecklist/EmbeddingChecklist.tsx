import { createRef, useCallback, useMemo, useState } from "react";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { Accordion, Button, Group, Icon, Stack, Text } from "metabase/ui";

import S from "./EmbeddingChecklist.module.css";

export interface EmbeddingStep {
  id: string;
  title: string;
  icon: string;
  description: string;
  features?: string[];
  image?: {
    src: string;
    srcSet?: string;
    alt: string;
  };
  actions?: Array<{
    label: string;
    href?: string;
    to?: string;
    variant?: "outline" | "subtle" | "filled";
    adminOnly?: boolean;
    showWhenMetabaseLinksEnabled?: boolean;
  }>;
}

interface EmbeddingChecklistProps {
  steps: EmbeddingStep[];
  completedSteps?: Record<string, boolean>;
  defaultOpenStep?: string;
  onStepChange?: (stepId: string | null) => void;
}

export const EmbeddingChecklist = ({
  steps,
  completedSteps = {},
  defaultOpenStep,
  onStepChange,
}: EmbeddingChecklistProps) => {
  const applicationName = useSelector(getApplicationName);
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isAdmin = useSelector(getUserIsAdmin);

  const itemRefs = useMemo(() => {
    return steps.reduce(
      (refs, step) => {
        refs[step.id] = createRef<HTMLDivElement>();
        return refs;
      },
      {} as Record<string, React.RefObject<HTMLDivElement>>,
    );
  }, [steps]);

  const isValidItemKey = useCallback(
    (key?: string | null): key is string => {
      return key != null && key in itemRefs;
    },
    [itemRefs],
  );

  const [itemValue, setItemValue] = useState<string | null>(null);

  const scrollElementIntoView = (element?: HTMLDivElement | null) => {
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleValueChange = (newValue: string | null) => {
    if (isValidItemKey(itemValue)) {
      const currentItem = itemRefs[itemValue].current;
      const iframe = currentItem?.querySelector("iframe");

      stopVideo(iframe);
    }

    if (newValue !== null && isValidItemKey(newValue)) {
      const newItem = itemRefs[newValue].current;
      scrollElementIntoView(newItem);
    }

    setItemValue(newValue);
    onStepChange?.(newValue);
  };

  const renderStepIcon = (step: EmbeddingStep) => {
    const isCompleted = completedSteps[step.id];

    if (isCompleted) {
      return <Icon name="check" c="var(--mb-color-success)" />;
    }

    return <Icon name={step.icon as any} />;
  };

  const renderStepActions = (step: EmbeddingStep) => {
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
      defaultValue={defaultOpenStep || steps[0]?.id}
      classNames={{
        chevron: S.chevron,
        content: S.content,
        control: S.control,
        icon: S.icon,
        item: S.item,
        label: S.label,
      }}
      onChange={handleValueChange}
    >
      {steps.map((step) => {
        const isCompleted = completedSteps[step.id];
        return (
          <Accordion.Item
            key={step.id}
            value={step.id}
            data-testid={`${step.id}-item`}
            ref={itemRefs[step.id]}
            data-completed={isCompleted}
          >
            <Accordion.Control
              icon={renderStepIcon(step)}
              className={isCompleted ? S.completedControl : S.normalControl}
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

                {step.features && (
                  <Text>
                    {step.features.length > 0 && (
                      <ul className={S.list}>
                        {step.features.map((feature, index) => (
                          <li key={index}>{feature}</li>
                        ))}
                      </ul>
                    )}
                  </Text>
                )}

                {renderStepActions(step)}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
};

const stopVideo = (iframe?: HTMLIFrameElement | null) => {
  if (!iframe) {
    return;
  }

  iframe.contentWindow?.postMessage(
    JSON.stringify({
      event: "command",
      func: "stopVideo",
      args: [],
    }),
    "*",
  );
};
