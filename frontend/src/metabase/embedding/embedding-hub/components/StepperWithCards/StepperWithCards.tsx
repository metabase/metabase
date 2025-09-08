import { Card, Group, Stack, Stepper, Text } from "metabase/ui";

import S from "./StepperWithCards.module.css";

export interface StepperSteps {
  title: string;
  cards: StepperCards[];
}

export interface StepperCards {
  title: string;
  description: string;
  optional?: boolean;
}

export const StepperWithCards = ({ steps }: { steps: StepperSteps[] }) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <Stepper
      active={1}
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
              {step.cards.map((card) => (
                <Card
                  className={S.stepCard}
                  key={card.title}
                  component="button"
                >
                  <Stack gap="xs">
                    <Text size="lg" fw="bold" c="var(--mb-color-text-dark)">
                      {card.title}
                    </Text>

                    <Text c="var(--mb-color-text-medium)" size="sm" lh="lg">
                      {card.description}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Group>
          }
        ></Stepper.Step>
      ))}
    </Stepper>
  );
};
