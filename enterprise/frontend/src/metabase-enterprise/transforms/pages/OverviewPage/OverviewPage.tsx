import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import { CardSection } from "../../components/CardSection";
import { NewTransformFromCardModal } from "../../components/NewTransformFromCardModal";
import { getNewTransformPageUrl } from "../../urls";

export function OverviewPage() {
  return (
    <Stack gap="3.5rem">
      <HeaderSection />
      <CreateSection />
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
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
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
        <Button leftSection={<Icon name="folder" />} onClick={openPicker}>
          {t`Existing saved question`}
        </Button>
      </Group>
      {isPickerOpened && <NewTransformFromCardModal onClose={closePicker} />}
    </CardSection>
  );
}
