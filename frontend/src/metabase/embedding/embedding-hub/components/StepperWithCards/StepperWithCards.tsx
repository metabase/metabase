import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { Card, Flex, Group, Stack, Stepper, Text } from "metabase/ui";

import S from "./StepperWithCards.module.css";

export interface StepperSteps {
  title: string;
  cards: StepperCards[];
}

export interface StepperCards {
  title: string;
  description: string;

  optional?: boolean;
  done?: boolean;

  url?: string;
  onClick?: string;
}

export const StepperWithCards = ({ steps }: { steps: StepperSteps[] }) => {
  if (steps.length === 0) {
    return null;
  }

  const lastDoneIndex = _.findLastIndex(steps, (step) =>
    step.cards.some((card) => card.done),
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
                return (
                  <Card
                    className={cx(S.stepCard, {
                      [S.optionalStepCard]: card.optional,
                    })}
                    key={card.title}
                    component="button"
                  >
                    <Stack justify="space-between" h="100%">
                      <Stack gap="xs" h="100%">
                        <Text
                          size={card.optional ? "md" : "lg"}
                          fw="bold"
                          c="var(--mb-color-text-dark)"
                        >
                          {card.title}
                        </Text>

                        <Text c="var(--mb-color-text-medium)" size="sm" lh="lg">
                          {card.description}
                        </Text>
                      </Stack>

                      {(card.optional || card.done) && (
                        <Flex justify="flex-end">
                          {match(card)
                            .with({ done: true }, () => (
                              <Text size="sm" c="var(--mb-color-success)">
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
                );
              })}
            </Group>
          }
        ></Stepper.Step>
      ))}
    </Stepper>
  );
};
