import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormDateInput,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { getTimelineIcons, getTimelineName } from "metabase/lib/timelines";
import {
  Button,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  TimeInput,
} from "metabase/ui";
import type {
  FormattingSettings,
  Timeline,
  TimelineEventData,
} from "metabase-types/api";

import FormArchiveButton from "../FormArchiveButton";

const EVENT_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required).max(255, Errors.maxLength),
  description: Yup.string().nullable().max(255, Errors.maxLength),
  timestamp: Yup.string().required(Errors.required),
  time_matters: Yup.boolean(),
  icon: Yup.string().required(Errors.required),
  timeline_id: Yup.string(),
});

type TimelineEventFormData = Omit<TimelineEventData, "timeline_id"> & {
  timeline_id: string | undefined;
};

export interface EventFormOwnProps {
  initialValues: TimelineEventData;
  timelines?: Timeline[];
  onSubmit: (data: TimelineEventData) => void;
  onArchive?: () => void;
  onCancel?: () => void;
}

export interface EventFormStateProps {
  formattingSettings?: FormattingSettings;
}

export type EventFormProps = EventFormOwnProps & EventFormStateProps;

const EventForm = ({
  initialValues,
  timelines = [],
  formattingSettings,
  onSubmit,
  onArchive,
  onCancel,
}: EventFormProps): JSX.Element => {
  const isNew = initialValues.id == null;
  const dateSettings = formattingSettings?.["type/Temporal"];

  const iconOptions = useMemo(() => {
    return getTimelineIcons();
  }, []);

  const timelineOptions = useMemo(() => {
    return timelines.map((t) => ({
      label: getTimelineName(t),
      value: String(t.id),
    }));
  }, [timelines]);

  const preparedInitialValues: TimelineEventFormData = {
    ...initialValues,
    timestamp: initialValues.timestamp || dayjs().utc(true).toISOString(),
    timeline_id: initialValues.timeline_id
      ? String(initialValues.timeline_id)
      : undefined,
  };

  const handleSubmit = useCallback(
    (values: TimelineEventFormData) => {
      return onSubmit({
        ...values,
        timeline_id: values.timeline_id
          ? parseInt(values.timeline_id, 10)
          : undefined,
      });
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={preparedInitialValues}
      validationSchema={EVENT_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ dirty, values, setFieldValue }) => (
        <Form disabled={!dirty} data-testid="event-form">
          <Stack>
            <FormTextInput
              name="name"
              label={t`Event name`}
              placeholder={t`Product launch`}
              autoFocus
            />
            <Flex align="end" gap="md">
              <FormDateInput
                name="timestamp"
                title={t`Date`}
                flex={1}
                valueFormat={dateSettings?.date_style}
                onChange={(date) => {
                  if (values.time_matters) {
                    // if time matters, preserve the time part of the timestamp
                    // when changing the date part
                    const timePart = dayjs.tz(values.timestamp);
                    const newDate = parseTimestamp(date)
                      .set("hour", timePart.hour())
                      .set("minute", timePart.minute());
                    setFieldValue("timestamp", newDate.toISOString());
                  } else {
                    setFieldValue("timestamp", dayjs(date).toISOString());
                  }
                }}
              />
              {values.time_matters ? (
                <Flex gap="xs" align="end">
                  <TimeInput
                    value={dayjs.tz(values.timestamp).toDate()}
                    name="date"
                    label={t`Time`}
                    fw="bold"
                    flex={1}
                    onChange={(time) => {
                      const timePart = dayjs.tz(time);
                      const date = parseTimestamp(values.timestamp)
                        .set("hour", timePart.hour())
                        .set("minute", timePart.minute());
                      setFieldValue("timestamp", date.toISOString());
                    }}
                  />
                  <Button
                    onClick={() => setFieldValue("time_matters", false)}
                    aria-label={t`Remove time`}
                    variant="subtle"
                    leftSection={<Icon name="close" />}
                  />
                </Flex>
              ) : (
                <Button
                  onClick={() => setFieldValue("time_matters", true)}
                >{t`Add time`}</Button>
              )}
            </Flex>
            <FormTextarea
              name="description"
              label={t`Description`}
              description={t`You can add links and formatting via markdown`}
              minRows={6}
              nullable
            />
            <FormSelect
              name="icon"
              label={t`Icon`}
              fw="bold"
              data={iconOptions}
              leftSection={values.icon ? <Icon name={values.icon} /> : null}
              renderOption={({ option }) => (
                <Group p="sm" fw="bold">
                  {option.value && <Icon name={option.value as IconName} />}
                  <span>{option.label}</span>
                </Group>
              )}
            />
            {timelines?.length > 1 && (
              <FormSelect
                name="timeline_id"
                label={t`Timeline`}
                data={timelineOptions}
              />
            )}
            <Flex gap="md" justify="end">
              <FormErrorMessage inline />
              {!isNew && (
                <FormArchiveButton onClick={onArchive}>
                  {t`Archive event`}
                </FormArchiveButton>
              )}
              <Button type="button" onClick={onCancel}>
                {t`Cancel`}
              </Button>
              <FormSubmitButton
                variant="filled"
                disabled={!dirty}
                label={isNew ? t`Create` : t`Update`}
              />
            </Flex>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EventForm;
