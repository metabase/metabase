import OnboardingS from "metabase/home/components/Onboarding/Onboarding.module.css";
import { Accordion, Box, Icon, Stack, Text, Title } from "metabase/ui";

import { GuideFooter, GuideHeader, GuideStepActionButton } from "./GuideChrome";
import type { GuideGroup } from "./use-guide-groups";

/**
 * PROTOTYPE: the "How to use Metabase" layout. One narrow column of accordion rows, one step open at a time, with
 * the step's content inline.
 */
export function AccordionGuideLayout({ groups }: { groups: GuideGroup[] }) {
  return (
    <Box mih="100%" bg="background_page-primary" px="xl" pt="xxl" pb="6rem">
      <Box maw={592} mx="auto">
        <Box mb="3rem">
          <GuideHeader />
        </Box>
        <Accordion
          className={OnboardingS.accordion}
          defaultValue={groups[0]?.steps[0]?.id}
          classNames={{
            chevron: OnboardingS.chevron,
            content: OnboardingS.content,
            control: OnboardingS.control,
            icon: OnboardingS.icon,
            item: OnboardingS.item,
            label: OnboardingS.label,
          }}
        >
          {groups.map((group) => (
            <Box component="section" key={group.id} mb="3rem">
              <Title order={3}>{group.title}</Title>
              <Text c="text-secondary" mt="xs" mb="lg">
                {group.description}
              </Text>
              {group.steps.map((step) => (
                <Accordion.Item key={step.id} value={step.id}>
                  <Accordion.Control icon={<Icon name={step.icon} />}>
                    {step.title}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="lg">
                      {step.body}
                      {step.action && (
                        <GuideStepActionButton action={step.action} />
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Box>
          ))}
        </Accordion>
        <GuideFooter />
      </Box>
    </Box>
  );
}
