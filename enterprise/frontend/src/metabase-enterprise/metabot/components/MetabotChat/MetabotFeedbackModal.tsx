import { useFormikContext } from "formik";
import { c, t } from "ttag";
import * as Yup from "yup";

import { useSetting } from "metabase/common/hooks";
import { Form, FormProvider } from "metabase/forms";
import { FormSelect } from "metabase/forms/components/FormSelect";
import { FormTextarea } from "metabase/forms/components/FormTextarea";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useMetabotSelector } from "metabase-enterprise/metabot/hooks/use-metabot-store";
import {
  getMetabotId,
  getMetabotState,
} from "metabase-enterprise/metabot/state";
import type { MetabotFeedback } from "metabase-types/api";

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
  const isAdmin = useSelector(getUserIsAdmin);
  const version = useSetting("version");

  const metabotId = useMetabotSelector(getMetabotId);
  const metabotState = useMetabotSelector(getMetabotState);

  const handleSubmit = (
    values: Pick<
      MetabotFeedback["feedback"],
      "issue_type" | "freeform_feedback"
    >,
  ) =>
    onSubmit({
      version,
      metabot_id: metabotId,
      feedback: {
        message_id: messageId,
        positive,
        ...values,
      },
      conversation_data: metabotState,
      is_admin: isAdmin,
      submission_time: new Date().toISOString(),
    });

  return (
    <Modal
      opened
      onClose={onClose}
      size="md"
      title={t`Metabot feedback`}
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
                  data={[
                    { label: t`UI bug`, value: "ui-bug" },
                    {
                      label: t`Took incorrect actions`,
                      value: "took-incorrect-actions",
                    },
                    { label: t`Overall refusal`, value: "overall-refusal" },
                    {
                      label: t`Did not follow request`,
                      value: "did-not-follow-request",
                    },
                    { label: t`Not factually correct`, value: "not-factual" },
                    {
                      label: t`Incomplete response`,
                      value: "incomplete-response",
                    },
                    { label: t`Other`, value: "other" },
                  ]}
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

            <Text size="sm" color="text-secondary">
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
