import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import type { UtmProps } from "metabase/selectors/settings";
import { Card, Flex, Group, Stack, Stepper, Text } from "metabase/ui";

import { DocsLink } from "../DocsLink";

import S from "./StepperWithCards.module.css";

export interface StepperStep {
  title: string;
  cards: StepperCard[];
}

export interface StepperCard {
  title: string;
  description: string;

  optional?: boolean;
  done?: boolean;

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

  // A step is done when every non-optional card is done.
  const lastDoneIndex = _.findLastIndex(steps, (step) =>
    step.cards.every((card) => card.done || card.optional),
  );

  return (
    <Stepper
      active={lastDoneIndex + 1}
      orientation="vertical"
      classNames={{
        step: S.step,
        stepLabel: S.stepLabel,
        verticalSeparator: S.verticalSeparator,
        stepCompletedIcon: S.stepCompletedIcon,
        stepIcon: S.stepIcon,
        stepWrapper: S.stepWrapper,
        stepBody: S.stepBody,
        stepDescription: S.stepDescription,
      }}
      iconSize={28}
    >
      {steps.map((step, index) => (
        <Stepper.Step
          key={index}
          label={step.title}
          color="var(--mb-color-success-darker)"
          description={
            <Group align="stretch">
              {step.cards.map((card) => {
                const onClick =
                  card.clickAction?.type === "click"
                    ? card.clickAction.onClick
                    : undefined;

                return (
                  <CardAction card={card} key={card.title}>
                    <Card
                      className={cx(S.stepCard, {
                        [S.optionalStepCard]: card.optional,
                        [S.doneStepCard]: card.done,
                      })}
                      component={onClick ? "button" : undefined}
                      onClick={onClick}
                    >
                      <Stack justify="space-between" h="100%">
                        <Stack gap="xs" h="100%">
                          <Text
                            size={card.optional ? "md" : "lg"}
                            fw="bold"
                            c={
                              card.done
                                ? "var(--mb-color-text-medium)"
                                : "var(--mb-color-text-dark)"
                            }
                          >
                            {card.title}
                          </Text>

                          <Text
                            c="var(--mb-color-text-medium)"
                            size="sm"
                            lh="lg"
                          >
                            {card.description}
                          </Text>
                        </Stack>

                        {(card.optional || card.done) && (
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
                              .with({ optional: true }, () => (
                                <Text size="sm" c="var(--mb-color-text-medium)">
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
        ></Stepper.Step>
      ))}
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
    .with({ type: "link" }, ({ to }) => <Link to={to}>{children}</Link>)
    .otherwise(() => children);
