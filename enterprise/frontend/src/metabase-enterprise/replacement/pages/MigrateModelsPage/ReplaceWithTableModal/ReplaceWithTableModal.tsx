import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import { useReplaceModelWithTableMutation } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type { Card, Table } from "metabase-types/api";

type ReplaceWithTableModalProps = {
  card: Card;
  opened: boolean;
  onClose: () => void;
};

export function ReplaceWithTableModal({
  card,
  opened,
  onClose,
}: ReplaceWithTableModalProps) {
  return (
    <Modal
      title={t`Replace this model with the base table?`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ReplaceWithTableLoader card={card} onClose={onClose} />
    </Modal>
  );
}

type ReplaceWithTableLoaderProps = {
  card: Card;
  onClose: () => void;
};

function ReplaceWithTableLoader({
  card,
  onClose,
}: ReplaceWithTableLoaderProps) {
  const metadata = useSelector(getMetadata);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const tableId = Lib.sourceTableOrCardId(query);

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQuery(
    typeof tableId === "number" ? { id: tableId } : skipToken,
  );

  if (isLoading || error != null || table == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <ReplaceWithTableForm card={card} table={table} onClose={onClose} />;
}

type ReplaceWithTableFormProps = {
  card: Card;
  table: Table;
  onClose: () => void;
};

function ReplaceWithTableForm({
  card,
  table,
  onClose,
}: ReplaceWithTableFormProps) {
  const [replaceModelWithTable] = useReplaceModelWithTableMutation();

  const handleSubmit = async () => {
    const action = replaceModelWithTable({ card_id: card.id });
    await action.unwrap();
    onClose();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg" mt="sm">
          <Text>
            {t`We'll replace this model with its base table, ${table.display_name}. Then we'll convert the model to a saved question.`}
          </Text>
          <Group gap="xs">
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Replace with the base table`}
              variant="filled"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
