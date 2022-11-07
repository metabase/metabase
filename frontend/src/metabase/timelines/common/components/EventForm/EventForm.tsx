import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import { getTimelineIcons, getTimelineName } from "metabase/lib/timelines";
import FormProvider from "metabase/core/components/FormProvider";
import Form from "metabase/core/components/Form";
import FormInput from "metabase/core/components/FormInput";
import FormDateInput from "metabase/core/components/FormDateInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormSelect from "metabase/core/components/FormSelect";
import { Timeline, TimelineEventData } from "metabase-types/api";

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
  timeline_id: Yup.number().required(t`required`),
});

export interface EventFormProps {
  initialValues: TimelineEventData;
  timelines: Timeline[];
  onSubmit: (data: TimelineEventData) => void;
  onCancel?: () => void;
}

const EventForm = ({
  initialValues,
  timelines,
  onSubmit,
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
            fullWidth
          />
          <FormDateInput
            name="timestamp"
            title={t`Date`}
            hasTime={values.time_matters}
            onHasTimeChange={value => setFieldValue("time_matters", value)}
          />
          <FormTextArea name="description" title={t`Description`} fullWidth />
          <FormSelect name="icon" title={t`Icon`} options={iconOptions} />
          {timelines.length > 1 && (
            <FormSelect
              name="timeline_id"
              title={t`Timeline`}
              options={timelineOptions}
            />
          )}
        </Form>
      )}
    </FormProvider>
  );
};

export default EventForm;
