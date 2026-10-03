import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text, Title, rem } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

export type FeedbackModalValues = {
  comments?: string;
  email?: string;
};

type FeedbackModalProps = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: FeedbackModalValues) => void | Promise<unknown>;
};

export const FeedbackModal = ({
  opened,
  onClose,
  onSubmit,
}: FeedbackModalProps) => {
  return (
    <Modal
      size={rem(530)}
      padding="xxl"
      opened={opened}
      withCloseButton={false}
      onClose={onClose}
    >
      <Title pb="sm" order={2}>{t`How can we improve embedding?`}</Title>
      <Stack gap="xl">
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- only admins can see this component */}
        <Text>{t`Please let us know what happened. We’re always looking for ways to improve Metabase.`}</Text>

        <FormProvider
          key={String(opened)}
          initialValues={{ comments: "", email: "" }}
          validationSchema={Yup.object({
            comments: Yup.string().optional().max(100_000, Errors.maxLength),
            /* Maximum usable: 254 octets, cf. https://www.rfc-editor.org/info/rfc3696/#section-3 errata */
            email: Yup.string().optional().max(320, Errors.maxLength),
          })}
          onSubmit={({ comments, email }) => onSubmit({ comments, email })}
        >
          {({ values, isSubmitting }) => {
            const label =
              (values.comments?.trim() ?? "") !== "" ||
              (values.email?.trim() ?? "") !== ""
                ? t`Send`
                : t`Skip`;
            return (
              <Form>
                <Stack gap="xl">
                  <FormTextarea
                    label={t`Feedback`}
                    name="comments"
                    placeholder={t`Tell us what happened`}
                    minRows={3}
                  />

                  <FormTextInput
                    label={t`Email`}
                    type="email"
                    name="email"
                    placeholder={t`Leave your email if you want us to follow up with you`}
                  />

                  <FormErrorMessage />

                  <Group justify="flex-end">
                    <Button onClick={onClose} disabled={isSubmitting}>
                      {t`Cancel`}
                    </Button>
                    <FormSubmitButton
                      variant="filled"
                      label={label}
                      failedLabel={label}
                    />
                  </Group>
                </Stack>
              </Form>
            );
          }}
        </FormProvider>
      </Stack>
    </Modal>
  );
};
