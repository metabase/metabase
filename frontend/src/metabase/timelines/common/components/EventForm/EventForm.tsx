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
import { Timeline, TimelineEventData } from "metabase-types/api";
import FormArchiveButton from "../FormArchiveButton";
import { EventFormFooter } from "./EventForm.styled";

const EventSchema = Yup.object({
  name: Yup.string()
    .required(t`required`)
    .max(255, ({ max }) => t`must be ${max} characters or less`),
  description: Yup.string().max(
    255,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  timestamp: Yup.string().required(`required`),
  time_matters: Yup.boolean(),
  icon: Yup.string().required(`required`),
  timeline_id: Yup.number(),
});

export interface EventFormProps {
  initialValues: TimelineEventData;
  timelines?: Timeline[];
  onSubmit: (data: TimelineEventData) => void;
  onArchive?: () => void;
  onCancel?: () => void;
}

const EventForm = ({
  initialValues,
  timelines = [],
  onSubmit,
  onArchive,
  onCancel,
}: EventFormProps): JSX.Element => {
  const isNew = initialValues.id == null;

  const iconOptions = useMemo(() => {
    return getTimelineIcons();
  }, []);

  const timelineOptions = useMemo(() => {
    return timelines.map(t => ({ name: getTimelineName(t), value: t.id }));
  }, [timelines]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={EventSchema}
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
            onHasTimeChange={value => setFieldValue("time_matters", value)}
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            infoLabel={t`Markdown supported`}
            infoTooltip={t`Add links and formatting via markdown`}
            fullWidth
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

export default EventForm;
