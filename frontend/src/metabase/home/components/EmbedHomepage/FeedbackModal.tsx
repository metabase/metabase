import { useState } from "react";
import { t } from "ttag";

import {
  Button,
  Group,
  Modal,
  rem,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "metabase/ui";

type FeedbackModalProps = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (feedback: { comment?: string; email?: string }) => void;
};

export const FeedbackModal = ({
  opened,
  onClose,
  onSubmit,
}: FeedbackModalProps) => {
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const handleSubmit = () =>
    onSubmit({
      comment: comment.trim() || undefined,
      email: email.trim() || undefined,
    });

  return (
    <Modal
      size={rem(530)}
      padding="xl"
      opened={opened}
      withCloseButton={false}
      onClose={onClose}
    >
      <Title pb="sm">{t`How can we improve embedding?`}</Title>
      <Stack spacing="lg">
        {/* eslint-disable-next-line no-literal-metabase-strings -- only admins can see this component */}
        <Text>{t`Please let us know what happened. We’re always looking for ways to improve Metabase.`}</Text>

        <Textarea
          label={t`Feedback`}
          name="comment"
          placeholder={t`Tell us what happened`}
          onChange={e => setComment(e.currentTarget.value)}
          minRows={3}
        />

        <TextInput
          label={t`Email`}
          type="email"
          name="email"
          placeholder={t`Leave your email if you want us to follow up with you`}
          onChange={e => setEmail(e.currentTarget.value)}
        />

        <Group position="right">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button variant="filled" onClick={handleSubmit}>
            {comment.trim().length + email.trim().length > 0
              ? t`Send`
              : t`Skip`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
