import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { UtmProps } from "metabase/selectors/settings";
import { Card, Flex, Group, Icon, Stack, Stepper, Text } from "metabase/ui";

import { DocsLink } from "../DocsLink";

import S from "./StepperWithCards.module.css";

export interface StepperStep {
  id: string;
  title: string;
  cards: StepperCard[];
}

export interface StepperCard {
  id: string;
  title: string;
  description: string;

  optional?: boolean;
  done?: boolean;
  locked?: boolean;

  clickAction?: StepperCardClickAction;
}

type DocsUtm = Required<Pick<UtmProps, "utm_campaign" | "utm_content">>;

export type StepperCardClickAction =
  | { type: "link"; to: string }
  | { type: "docs"; docsPath: string; utm: DocsUtm }
  | { type: "click"; onClick: () => void };

export const StepperWithCards = ({ steps }: { steps: StepperStep[] }) => {
  if (steps.length === 0) {
    return null;
  }

  // Find the next actionable card (first undone, unlocked card in the first incomplete step)
  const nextCard = (() => {
    const firstIncompleteStep = steps.find(
      (step) => !step.cards.every((card) => card.done || card.optional),
    );

    if (!firstIncompleteStep) {
      return null;
    }

    return firstIncompleteStep.cards.find(
      (card) => !card.done && !card.locked && !card.optional,
    );
  })();

  return (
    <Stepper
      active={0}
      orientation="vertical"
      classNames={{
        stepLabel: S.stepLabel,
        verticalSeparator: S.verticalSeparator,
        stepIcon: S.stepIcon,
        stepWrapper: S.stepWrapper,
        stepBody: S.stepBody,
        stepDescription: S.stepDescription,
      }}
      iconSize={28}
    >
      {steps.map((step) => {
        const isDone = step.cards.every((card) => card.done || card.optional);

        return (
          <Stepper.Step
            key={step.id}
            label={step.title}
            className={cx(S.step, isDone && S.stepDone)}
            icon={isDone ? <Icon name="check" /> : undefined}
            description={
              <Group align="stretch">
                {step.cards.map((card) => {
                  const onClick =
                    card.clickAction?.type === "click"
                      ? card.clickAction.onClick
                      : undefined;

                  const isNextCard = nextCard && nextCard.id === card.id;

                  return (
                    <CardAction card={card} key={card.id}>
                      <Card
                        className={cx(S.stepCard, {
                          [S.optionalStepCard]: card.optional,
                          [S.lockedStepCard]: card.locked,
                          [S.nextStepCard]: isNextCard,
                        })}
                        component={onClick ? "button" : undefined}
                        onClick={onClick}
                        disabled={card.locked}
                        data-testid={`step-card-${card.id}`}
                        data-next-step={isNextCard}
                      >
                        <Stack justify="space-between" h="100%">
                          <Stack gap="xs" h="100%">
                            <Text
                              size={card.optional ? "md" : "lg"}
                              fw="bold"
                              c={
                                card.done
                                  ? "var(--mb-color-text-secondary)"
                                  : "var(--mb-color-text-primary)"
                              }
                            >
                              {card.title}
                            </Text>

                            <Text
                              c="var(--mb-color-text-secondary)"
                              size="sm"
                              lh="lg"
                            >
                              {card.description}
                            </Text>
                          </Stack>

                          {(card.optional || card.done || card.locked) && (
                            <Flex justify="flex-end">
                              {match(card)
                                .with({ done: true }, () => (
                                  <Text
                                    size="sm"
                                    c="var(--mb-color-success-darker)"
                                  >
                                    {t`Done`}
                                  </Text>
                                ))
                                .with({ locked: true }, () => (
                                  <Icon
                                    name="lock"
                                    c="var(--mb-color-text-secondary)"
                                  />
                                ))
                                .with({ optional: true }, () => (
                                  <Text
                                    size="sm"
                                    c="var(--mb-color-text-secondary)"
                                  >
                                    {t`Optional`}
                                  </Text>
                                ))
                                .otherwise(() => null)}
                            </Flex>
                          )}
                        </Stack>
                      </Card>
                    </CardAction>
                  );
                })}
              </Group>
            }
            data-done={isDone}
          ></Stepper.Step>
        );
      })}
    </Stepper>
  );
};

const CardAction = ({
  card,
  children,
}: {
  card: StepperCard;
  children: ReactNode;
}) =>
  match(card.clickAction)
    .with({ type: "docs" }, ({ docsPath, utm }) => (
      <DocsLink docsPath={docsPath} utm={utm}>
        {children}
      </DocsLink>
    ))
    .with({ type: "link" }, ({ to }) => {
      if (card.locked) {
        return children;
      }

      return <Link to={to}>{children}</Link>;
    })
    .otherwise(() => children);
