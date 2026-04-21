import { useFormikContext } from "formik";
import { c, t } from "ttag";
import * as Yup from "yup";

import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import { useMetabotName } from "metabase/metabot/hooks";
import { getMetabotId } from "metabase/metabot/state";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useSelector } from "metabase/utils/redux";
import type { MetabotFeedback } from "metabase-types/api";

import { getIssueTypeOptions } from "./feedback-issue-types";

// Issue types that require free text feedback
const ISSUE_TYPES_REQUIRING_FREEFORM = ["ui-bug", "other"] as const;
type IssueTypesRequiringFreeform =
  (typeof ISSUE_TYPES_REQUIRING_FREEFORM)[number];

const isFreeformRequired = (
  value: string,
): value is IssueTypesRequiringFreeform =>
  ISSUE_TYPES_REQUIRING_FREEFORM.includes(value as IssueTypesRequiringFreeform);

const FEEDBACK_SCHEMA = Yup.object({
  issue_type: Yup.string().nullable().default(""),
  freeform_feedback: Yup.string().when("issue_type", {
    is: isFreeformRequired,
    then: (schema) => schema.required(Errors.required),
    otherwise: (schema) => schema.nullable(),
  }),
});

interface MetabotFeedbackModalProps {
  onClose: () => void;
  onSubmit: (feedback: MetabotFeedback) => void;
  messageId: string;
  positive: boolean;
}

const FeedbackTextLabel = ({ positive }: { positive: boolean }) => {
  const { values } = useFormikContext<Yup.InferType<typeof FEEDBACK_SCHEMA>>();

  const isRequired =
    !positive && values.issue_type && isFreeformRequired(values.issue_type);

  return (
    <Text>
      {isRequired
        ? t`Any details that you'd like to share? (required)`
        : t`Any details that you'd like to share? (optional)`}
    </Text>
  );
};

export const MetabotFeedbackModal = ({
  onClose,
  onSubmit,
  messageId,
  positive,
}: MetabotFeedbackModalProps) => {
  const applicationName = useSelector(getApplicationName);
  const metabotName = useMetabotName();
  const metabotId = useSelector(getMetabotId);

  const handleSubmit = (
    values: Pick<MetabotFeedback, "issue_type" | "freeform_feedback">,
  ) =>
    onSubmit({
      metabot_id: metabotId,
      message_id: messageId,
      positive,
      issue_type: values.issue_type || undefined,
      freeform_feedback: values.freeform_feedback,
    });

  return (
    <Modal
      opened
      onClose={onClose}
      size="md"
      title={t`${metabotName} feedback`}
      data-testid="metabot-feedback-modal"
    >
      <FormProvider
        initialValues={{
          issue_type: positive ? undefined : "",
          freeform_feedback: "",
        }}
        validationSchema={FEEDBACK_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="md">
            {!positive && (
              <Stack gap="xs">
                <Text>{t`What kind of issue are you reporting? (optional)`}</Text>
                <FormSelect
                  name="issue_type"
                  placeholder={t`Select issue type`}
                  data={getIssueTypeOptions()}
                />
              </Stack>
            )}
            <Stack gap="xs">
              <FeedbackTextLabel positive={positive} />
              <FormTextarea
                name="freeform_feedback"
                placeholder={
                  positive
                    ? t`Tell us what you liked!`
                    : t`What could be improved about this response?`
                }
                minRows={6}
                maxRows={12}
                resize="vertical"
                autosize
              />
            </Stack>

            <Text size="sm" c="text-secondary">
              {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- this is a translation context string, not shown to users */}
              {c("{0} is the name of the application, usually 'Metabase'")
                .t`Please submit this report to ${applicationName}. Note that it may contain sensitive data from your conversation.`}
            </Text>

            <Group justify="flex-end" gap="md" mt="md">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button variant="filled" type="submit">{c(
                "This is a verb, not a noun",
              ).t`Submit`}</Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
};
