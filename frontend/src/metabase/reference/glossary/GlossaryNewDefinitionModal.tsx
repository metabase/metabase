import { type FormEvent, useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Group, Modal, Stack, TextInput, Textarea } from "metabase/ui";

type GlossaryModalProps = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (term: string, definition: string) => void;
};

export function GlossaryNewDefinitionModal({
  opened,
  onClose,
  onSubmit,
}: GlossaryModalProps) {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");

  useEffect(() => {
    setTerm("");
    setDefinition("");
  }, [opened]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      onSubmit(term, definition);
      onClose();
    },
    [term, definition, onSubmit, onClose],
  );

  return (
    <Modal title={t`New definition`} onClose={onClose} opened={opened}>
      <form onSubmit={handleSubmit}>
        <Stack gap="xl" mt="md">
          <TextInput
            label={t`Term`}
            placeholder={t`Data science`}
            required
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <Textarea
            label={t`Definition`}
            placeholder={t`Data science is multifaceted and can be described as a science, a research paradigm, a research method, a discipline, a workflow, and a profession.`}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            autosize
            minRows={3}
            maxRows={6}
          />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button type="submit" variant="filled">{t`Create`}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
