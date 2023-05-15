import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import { getTimelineIcons, getTimelineName } from "metabase/lib/timelines";
import Button from "metabase/core/components/Button/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormDateInput from "metabase/core/components/FormDateInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormSelect from "metabase/core/components/FormSelect";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import * as Errors from "metabase/core/utils/errors";
import {
  FormattingSettings,
  Timeline,
  TimelineEventData,
} from "metabase-types/api";
import FormArchiveButton from "../FormArchiveButton";
import { EventFormFooter } from "./EventForm.styled";

const EVENT_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required).max(255, Errors.maxLength),
  description: Yup.string().nullable().max(255, Errors.maxLength),
  timestamp: Yup.string().required(Errors.required),
  time_matters: Yup.boolean(),
  icon: Yup.string().required(Errors.required),
  timeline_id: Yup.number(),
});

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
    return timelines.map(t => ({ name: getTimelineName(t), value: t.id }));
  }, [timelines]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={EVENT_SCHEMA}
      onSubmit={onSubmit}
    >
      {({ dirty, values, setFieldValue }) => (
        <Form disabled={!dirty}>
          <FormInput
            name="name"
            title={t`Event name`}
            placeholder={t`Product launch`}
            autoFocus
          />
          <FormDateInput
            name="timestamp"
            title={t`Date`}
            hasTime={values.time_matters}
            dateFormat={dateSettings?.date_style}
            timeFormat={dateSettings?.time_style}
            onHasTimeChange={value => setFieldValue("time_matters", value)}
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            infoLabel={t`Markdown supported`}
            infoTooltip={t`Add links and formatting via markdown`}
            nullable
          />
          <FormSelect name="icon" title={t`Icon`} options={iconOptions} />
          {timelines.length > 1 && (
            <FormSelect
              name="timeline_id"
              title={t`Timeline`}
              options={timelineOptions}
            />
          )}
          <EventFormFooter>
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
              title={isNew ? t`Create` : t`Update`}
              disabled={!dirty}
              primary
            />
          </EventFormFooter>
        </Form>
      )}
    </FormProvider>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EventForm;
