import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { Schedule } from "metabase/common/components/Schedule";
import { useDispatch } from "metabase/lib/redux";
import {
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { CardSection } from "../../components/CardSection";
import { DEFAULT_SCHEDULE, SCHEDULE_OPTIONS } from "../../constants";
import {
  getNewTransformFromCardPageUrl,
  getNewTransformFromTypePageUrl,
} from "../../urls";

export function OverviewPage() {
  return (
    <Flex direction="column" align="center">
      <Stack gap="3.5rem">
        <HeaderSection />
        <CreateSection />
        <ScheduleSection />
      </Stack>
    </Flex>
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
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handlePickerChange = (item: QuestionPickerValueItem) => {
    dispatch(push(getNewTransformFromCardPageUrl(item.id)));
  };

  return (
    <CardSection
      label={t`Create a transform`}
      description={t`You can create a new transform a few different ways.`}
    >
      <Group p="lg">
        <Button
          component={Link}
          to={getNewTransformFromTypePageUrl("query")}
          leftSection={<Icon name="notebook" />}
        >
          {t`Query builder`}
        </Button>
        <Button
          component={Link}
          to={getNewTransformFromTypePageUrl("native")}
          leftSection={<Icon name="sql" />}
        >
          {t`SQL editor`}
        </Button>
        <Button leftSection={<Icon name="folder" />} onClick={openPicker}>
          {t`Existing saved question`}
        </Button>
      </Group>
      {isPickerOpened && (
        <QuestionPickerModal
          onChange={handlePickerChange}
          onClose={closePicker}
        />
      )}
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
      <Group p="lg">
        <Schedule
          cronString={value ?? DEFAULT_SCHEDULE}
          scheduleOptions={SCHEDULE_OPTIONS}
          verb={t`Run`}
          onScheduleChange={handleChange}
        />
      </Group>
      <Divider />
      <Group p="lg" justify="end">
        <Button>{t`Run`}</Button>
      </Group>
    </CardSection>
  );
}
