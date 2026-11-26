import cx from "classnames";
import { useState } from "react";

import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import { GuideFooter, GuideHeader, GuideStepActionButton } from "./GuideChrome";
import S from "./NumberedGuideLayout.module.css";
import type { GuideGroup } from "./use-guide-groups";

/**
 * PROTOTYPE: the installation setup layout. One numbered step is open at a time; finishing it checks it off and
 * opens the next one. Any step can be reopened.
 */
export function NumberedGuideLayout({ groups }: { groups: GuideGroup[] }) {
  const steps = groups.flatMap((group) => group.steps);
  const [activeId, setActiveId] = useState<string | undefined>(steps[0]?.id);
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const completeStep = (index: number) => {
    setCompletedIds((ids) => new Set(ids).add(steps[index].id));
    setActiveId(steps[index + 1]?.id);
  };

  return (
    <Box mih="100%" bg="background_page-secondary" px="xl" pt="xxl" pb="6rem">
      <Stack gap="xl" maw={640} mx="auto" pl="lg">
        <GuideHeader />
        <Box role="list" mt="lg">
          {groups.map((group) => (
            <Box component="section" key={group.id} mb="xl">
              <Text
                component="h2"
                c="text-secondary"
                fz="sm"
                fw={700}
                tt="uppercase"
                lts="0.45px"
                mb="md"
              >
                {group.title}
              </Text>
              {group.steps.map((step) => {
                const index = steps.indexOf(step);
                const isCompleted = completedIds.has(step.id);

                if (step.id !== activeId) {
                  return (
                    <UnstyledButton
                      key={step.id}
                      className={S.inactiveStep}
                      role="listitem"
                      aria-label={step.title}
                      onClick={() => setActiveId(step.id)}
                    >
                      <Center
                        className={cx(S.number, {
                          [S.numberCompleted]: isCompleted,
                        })}
                      >
                        {isCompleted ? (
                          <Icon
                            name="check"
                            size="1rem"
                            c="text-primary-inverse"
                          />
                        ) : (
                          index + 1
                        )}
                      </Center>
                      <Text
                        fz="lg"
                        fw={700}
                        c={isCompleted ? "feedback-positive" : "core-brand"}
                      >
                        {step.title}
                      </Text>
                    </UnstyledButton>
                  );
                }

                return (
                  <Box
                    component="section"
                    key={step.id}
                    className={S.activeStep}
                    role="listitem"
                    aria-label={step.title}
                    aria-current="step"
                  >
                    <Center className={S.number}>{index + 1}</Center>
                    <Text fz="xl" fw={700} c="core-brand">
                      {step.title}
                    </Text>
                    <Text c="text-secondary" mt="xs" mb="lg" lh="1.5rem">
                      {step.summary}
                    </Text>
                    <Stack gap="lg">
                      {step.body}
                      <Group justify="space-between" mt="sm">
                        {step.action ? (
                          <GuideStepActionButton action={step.action} />
                        ) : (
                          <span />
                        )}
                        <Button
                          variant="filled"
                          onClick={() => completeStep(index)}
                        >
                          {index < steps.length - 1 ? "Next" : "Done"}
                        </Button>
                      </Group>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
        <GuideFooter />
      </Stack>
    </Box>
  );
}
