import { useState } from "react";

import GetStartedS from "metabase/embedding-hub/pages/GetStarted/GetStarted.module.css";
import { ChecklistCard } from "metabase/embedding-hub/pages/GetStarted/ChecklistCard";
import { Box, Button, Group, Modal, Stack, Text, Title } from "metabase/ui";

import { GuideFooter, GuideHeader, GuideStepActionButton } from "./GuideChrome";
import type { GuideGroup } from "./use-guide-groups";

/**
 * PROTOTYPE: the Embedding hub layout. Grouped, numbered cards give the whole path at a glance; a card opens its
 * substeps in a modal that you can step through.
 */
export function CardsGuideLayout({ groups }: { groups: GuideGroup[] }) {
  const steps = groups.flatMap((group) => group.steps);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openStep = openIndex == null ? undefined : steps[openIndex];

  return (
    <Box mih="100%" bg="background_page-secondary" px="xl" py="xxl">
      <Stack gap="xxl" maw={800} mx="auto">
        <GuideHeader />
        {groups.map((group) => (
          <Box component="section" key={group.id}>
            <Title order={2} fz="xl">
              {group.title}
            </Title>
            <Text c="text-secondary" mt="xs" mb="md">
              {group.description}
            </Text>
            <Box className={GetStartedS.cardGrid}>
              {group.steps.map((step) => {
                const index = steps.indexOf(step);
                return (
                  <ChecklistCard
                    key={step.id}
                    step={index + 1}
                    icon={step.icon}
                    title={step.title}
                    description={step.summary}
                    onClick={() => setOpenIndex(index)}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
        <GuideFooter />
      </Stack>

      <Modal
        opened={openStep != null}
        onClose={() => setOpenIndex(null)}
        size="38rem"
        title={
          openStep && openIndex != null
            ? `${openIndex + 1}. ${openStep.title}`
            : undefined
        }
      >
        {openStep && openIndex != null && (
          <Stack gap="lg" pt="sm">
            {openStep.body}
            {openStep.action && (
              <GuideStepActionButton action={openStep.action} />
            )}
            <Group justify="space-between" mt="md">
              <Button
                variant="subtle"
                disabled={openIndex === 0}
                onClick={() => setOpenIndex(openIndex - 1)}
              >
                Back
              </Button>
              {openIndex < steps.length - 1 ? (
                <Button
                  variant="filled"
                  onClick={() => setOpenIndex(openIndex + 1)}
                >
                  Next step
                </Button>
              ) : (
                <Button variant="filled" onClick={() => setOpenIndex(null)}>
                  Done
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}
