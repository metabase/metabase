import { type FormEvent, useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Group, Modal, Stack, TextInput, Textarea } from "metabase/ui";

type GlossaryEditDefinitionModalProps = {
  id?: number;
  term?: string;
  definition?: string;
  opened: boolean;
  onClose: () => void;
  onSubmit: (id: number, term: string, definition: string) => void;
};

export function GlossaryEditDefinitionModal({
  id,
  term: initialTerm,
  definition: initialDefinition,
  opened,
  onClose,
  onSubmit,
}: GlossaryEditDefinitionModalProps) {
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");

  useEffect(() => {
    setTerm(initialTerm ?? "");
    setDefinition(initialDefinition ?? "");
  }, [initialTerm, initialDefinition]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (id) {
        onSubmit(id, term, definition);
        onClose();
      }
    },
    [id, term, definition, onSubmit, onClose],
  );

  return (
    <Modal title={t`Edit definition`} onClose={onClose} opened={opened}>
      <form onSubmit={handleSubmit}>
        <Stack gap="xl" mt="md">
          <TextInput
            autoFocus
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
            <Button type="submit" variant="filled">{t`Save`}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
