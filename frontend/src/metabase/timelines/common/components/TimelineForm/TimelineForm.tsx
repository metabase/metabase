import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { Button } from "metabase/common/components/Button";
import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import { FormInput } from "metabase/common/components/FormInput";
import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { FormTextArea } from "metabase/common/components/FormTextArea";
import { Form, FormProvider, FormSelect } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { getTimelineIcons } from "metabase/lib/timelines";
import { Group, Icon, type IconName } from "metabase/ui";
import type { TimelineData } from "metabase-types/api";

import FormArchiveButton from "../FormArchiveButton";

import { TimelineFormFooter } from "./TimelineForm.styled";

const TIMELINE_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required).max(255, Errors.maxLength),
  description: Yup.string().nullable().max(255, Errors.maxLength),
  icon: Yup.string().required(Errors.required),
});

export interface TimelineFormProps {
  initialValues: TimelineData;
  onSubmit: (data: TimelineData) => void;
  onArchive?: () => void;
  onCancel?: () => void;
}

const TimelineForm = ({
  initialValues,
  onSubmit,
  onArchive,
  onCancel,
}: TimelineFormProps) => {
  const isNew = initialValues.id == null;
  const icons = useMemo(() => getTimelineIcons(), []);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={TIMELINE_SCHEMA}
      onSubmit={onSubmit}
    >
      {({ values, dirty }) => (
        <Form disabled={!dirty}>
          <FormInput
            name="name"
            title={t`Name`}
            placeholder={t`Product releases`}
            autoFocus
          />
          <FormTextArea name="description" title={t`Description`} nullable />
          <FormSelect
            name="icon"
            title={t`Default icon`}
            data={icons}
            leftSection={values.icon ? <Icon name={values.icon} /> : null}
            renderOption={({ option }) => (
              <Group p="sm" fw="bold">
                {option.value && <Icon name={option.value as IconName} />}
                <span>{option.label}</span>
              </Group>
            )}
          />
          <TimelineFormFooter>
            <FormErrorMessage inline />
            {!isNew && (
              <FormArchiveButton onClick={onArchive}>
                {t`Archive timeline and all events`}
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
          </TimelineFormFooter>
        </Form>
      )}
    </FormProvider>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineForm;
