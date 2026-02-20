import { msgid, ngettext, t } from "ttag";

import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, Group, Stack, Text } from "metabase/ui";
import { useReplaceSourceMutation } from "metabase-enterprise/api/replacement";
import type {
  ReplaceSourceEntry,
  ReplaceSourceRunId,
} from "metabase-types/api";

type ConfirmModalContentProps = {
  sourceEntry: ReplaceSourceEntry;
  targetEntry: ReplaceSourceEntry;
  dependentsCount: number;
  onSubmit: (runId: ReplaceSourceRunId) => void;
  onCancel: () => void;
};

export function ConfirmModalContent({
  sourceEntry,
  targetEntry,
  dependentsCount,
  onSubmit,
  onCancel,
}: ConfirmModalContentProps) {
  const [replaceSource] = useReplaceSourceMutation();

  const handleSubmit = async () => {
    const response = await replaceSource({
      source_entity_id: sourceEntry.id,
      source_entity_type: sourceEntry.type,
      target_entity_id: targetEntry.id,
      target_entity_type: targetEntry.type,
    }).unwrap();
    onSubmit(response.run_id);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack>
          <Text>{t`This can't be undone.`}</Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onCancel}>{t`Go back`}</Button>
            <Button type="submit" variant="filled" color="error">
              {getSubmitLabel(dependentsCount)}
            </Button>
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getSubmitLabel(dependentsCount: number): string {
  return ngettext(
    msgid`Replace data source in ${dependentsCount} item`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}
