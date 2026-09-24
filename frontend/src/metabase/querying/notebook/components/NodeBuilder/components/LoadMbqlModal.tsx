import { useState } from "react";
import { t } from "ttag";

import { Button, Group, Modal, Stack, Text, Textarea } from "metabase/ui";

const PLACEHOLDER = '{ "source-table": 2, "joins": [ … ] }';

const TEXTAREA_STYLES = {
  input: { fontFamily: "Monaco, Menlo, Consolas, monospace", fontSize: 12 },
};

type LoadMbqlModalProps = {
  opened: boolean;
  onClose: () => void;
  // Resolves to an error message, or null when the query was loaded.
  onSubmit: (text: string) => Promise<string | null>;
};

export function LoadMbqlModal({
  opened,
  onClose,
  onSubmit,
}: LoadMbqlModalProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    const message = await onSubmit(text);
    setIsLoading(false);
    if (message) {
      setError(message);
    } else {
      setText("");
      onClose();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Load MBQL`} size="lg">
      <Stack gap="md">
        <Text c="text-secondary" fz="sm">
          {t`Paste a query as MBQL JSON, either the inner query object or a full dataset query with database, type and query. It replaces whatever is on the canvas.`}
        </Text>
        <Textarea
          value={text}
          placeholder={PLACEHOLDER}
          autosize
          minRows={10}
          maxRows={20}
          styles={TEXTAREA_STYLES}
          error={error ?? undefined}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button
            variant="filled"
            loading={isLoading}
            disabled={text.trim() === ""}
            onClick={handleSubmit}
          >
            {t`Booyah`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
