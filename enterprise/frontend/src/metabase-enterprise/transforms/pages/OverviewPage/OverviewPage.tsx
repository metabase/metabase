import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Schedule } from "metabase/common/components/Schedule";
import { Box, Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import { CardSection } from "../../components/CardSection";
import { NewTransformFromCardModal } from "../../components/NewTransformFromCardModal";
import { DEFAULT_SCHEDULE, SCHEDULE_OPTIONS } from "../../constants";
import { getNewTransformPageUrl } from "../../urls";

export function OverviewPage() {
  return (
    <Stack gap="3.5rem">
      <HeaderSection />
      <CreateSection />
      <ScheduleSection />
    </Stack>
  );
}

function HeaderSection() {
  return (
    <Stack gap="sm">
      <Title order={1}>{t`Transforms overview`}</Title>
      <Text>{t`Create custom views and tables with transforms, and run them on a schedule.`}</Text>
    </Stack>
  );
}

function CreateSection() {
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();

  return (
    <CardSection
      label={t`Create a transform`}
      description={t`You can create a new transform a few different ways.`}
    >
      <Group px="lg" py="xl">
        <Button
          component={Link}
          to={getNewTransformPageUrl("query")}
          leftSection={<Icon name="notebook" />}
        >
          {t`Query builder`}
        </Button>
        <Button
          component={Link}
          to={getNewTransformPageUrl("native")}
          leftSection={<Icon name="sql" />}
        >
          {t`SQL editor`}
        </Button>
        <Button leftSection={<Icon name="folder" />} onClick={openModal}>
          {t`Existing saved question`}
        </Button>
      </Group>
      {isModalOpened && <NewTransformFromCardModal onClose={closeModal} />}
    </CardSection>
  );
}

function ScheduleSection() {
  const { value, updateSetting } = useAdminSetting("transform-schedule");

  const handleChange = (newValue: string) => {
    updateSetting({ key: "transform-schedule", value: newValue });
  };

  return (
    <CardSection
      label={t`Schedule`}
      description={t`Pick when your transforms should run.`}
    >
      <Box px="lg" py="xl">
        <Schedule
          cronString={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          verb={c("A verb in the imperative mood").t`Run`}
          onScheduleChange={handleChange}
        />
      </Box>
    </CardSection>
  );
}
