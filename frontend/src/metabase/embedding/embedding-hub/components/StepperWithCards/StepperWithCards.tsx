import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { UtmProps } from "metabase/selectors/settings";
import {
  Alert,
  Card,
  Flex,
  Grid,
  Group,
  Icon,
  Stack,
  Stepper,
  Text,
} from "metabase/ui";

import { DocsLink } from "../DocsLink";

import S from "./StepperWithCards.module.css";

export interface StepperStep {
  id: string;
  title: string;
  cards: StepperCard[];

  /** Show an alert below the step */
  alert?: { type: "info" | "success"; message: string };
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
  | { type: "docs"; docsPath: string; anchor?: string; utm: DocsUtm }
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
        const hasOnlyOptionalCards = step.cards.every((card) => card.optional);

        return (
          <Stepper.Step
            key={step.id}
            label={step.title}
            className={cx(S.step, isDone && S.stepDone)}
            icon={isDone ? <Icon name="check" /> : undefined}
            description={
              <div>
                <Grid>
                  {step.cards.map((card) => {
                    const onClick =
                      card.clickAction?.type === "click"
                        ? card.clickAction.onClick
                        : undefined;

                    const isNextCard = nextCard && nextCard.id === card.id;

                    const getColSpan = () =>
                      !card.optional || hasOnlyOptionalCards ? 8 : 4;

                    return (
                      <Grid.Col
                        span={{ xs: 12, md: getColSpan() }}
                        key={card.id}
                      >
                        <CardAction card={card}>
                          <Card
                            h="100%"
                            mih="8.75rem"
                            className={cx(S.stepCard, {
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
                                      ? "text-secondary"
                                      : "text-primary"
                                  }
                                >
                                  {card.title}
                                </Text>

                                <Text c="text-secondary" size="sm" lh="lg">
                                  {card.description}
                                </Text>
                              </Stack>

                              {(card.optional || card.done || card.locked) && (
                                <Flex justify="flex-end">
                                  {match(card)
                                    .with({ done: true }, () => (
                                      <Group gap="xs">
                                        <Icon
                                          name="check"
                                          c="success-secondary"
                                          size={12}
                                        />
                                        <Text size="sm" c="success-secondary">
                                          {t`Done`}
                                        </Text>
                                      </Group>
                                    ))
                                    .with({ locked: true }, () => (
                                      <Group gap="xs">
                                        <Icon
                                          name="lock"
                                          c="text-secondary"
                                          size={12}
                                        />

                                        <Text c="text-secondary" fz={12}>
                                          {t`Complete the other steps to unlock`}
                                        </Text>
                                      </Group>
                                    ))
                                    .with({ optional: true }, () => (
                                      <Text size="sm" c="text-secondary">
                                        {t`Optional`}
                                      </Text>
                                    ))
                                    .otherwise(() => null)}
                                </Flex>
                              )}
                            </Stack>
                          </Card>
                        </CardAction>
                      </Grid.Col>
                    );
                  })}
                </Grid>

                {step.alert && (
                  <StepAlert
                    type={step.alert.type}
                    message={step.alert.message}
                  />
                )}
              </div>
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
    .with({ type: "docs" }, ({ docsPath, anchor, utm }) => (
      <DocsLink docsPath={docsPath} anchor={anchor} utm={utm}>
        {children}
      </DocsLink>
    ))
    .with({ type: "link" }, ({ to }) => {
      if (card.locked) {
        return children;
      }

      return (
        <Link to={to} className={S.stepCardLink}>
          {children}
        </Link>
      );
    })
    .otherwise(() => children);

const StepAlert = ({
  type,
  message,
}: {
  type: "info" | "success";
  message: string;
}) => (
  <Alert
    icon={<Icon size={14} name={type === "success" ? "check" : "info"} />}
    mt="xl"
    color={type === "info" ? "brand" : type}
    lh="lg"
    classNames={{
      wrapper: S.infoAlertWrapper,
      icon: S.infoAlertIcon,
      message: S.infoAlertMessage,
    }}
  >
    {message}
  </Alert>
);
