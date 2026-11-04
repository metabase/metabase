import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { getTimelineIcons } from "metabase/common/utils/timelines";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { TimelineData } from "metabase-types/api";

import FormArchiveButton from "../FormArchiveButton";

import { IconField } from "./IconField";

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

export const TimelineForm = ({
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
      {({ dirty }) => (
        <Form disabled={!dirty}>
          <Stack gap="xl">
            <FormTextInput
              name="name"
              label={t`Name`}
              placeholder={t`Product releases`}
              // The form can mount after the modal opens (while loading), when the
              // modal no longer looks for `data-autofocus`
              autoFocus
              data-autofocus
            />
            <FormTextarea
              name="description"
              label={t`Description`}
              minRows={5}
              nullable
            />
            <IconField name="icon" title={t`Default icon`} options={icons} />
          </Stack>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            {!isNew && (
              <FormArchiveButton onClick={onArchive}>
                {t`Archive timeline and all events`}
              </FormArchiveButton>
            )}
            <Button type="button" onClick={onCancel}>
              {t`Cancel`}
            </Button>
            <FormSubmitButton
              label={isNew ? t`Create` : t`Update`}
              disabled={!dirty}
              variant="filled"
            />
          </Modal.Footer>
        </Form>
      )}
    </FormProvider>
  );
};
