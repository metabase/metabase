import { jt, t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, Group, List, Modal, Stack, Text } from "metabase/ui";
import {
  useGetTableSelectionInfoQuery,
  usePublishTablesMutation,
} from "metabase-enterprise/api";
import type { PublishTableInfo, TableSelectors } from "metabase-types/api";

type PublishTablesModalProps = {
  selection: TableSelectors;
  isOpened: boolean;
  onPublish?: () => void;
  onClose: () => void;
};

export function PublishTablesModal({
  selection,
  isOpened,
  onPublish,
  onClose,
}: PublishTablesModalProps) {
  return (
    <Modal
      title={<ModalTitle selection={selection} />}
      opened={isOpened}
      onClose={onClose}
    >
      <ModalBody
        selection={selection}
        onPublish={onPublish}
        onClose={onClose}
      />
    </Modal>
  );
}

type ModalTitleProps = {
  selection: TableSelectors;
};

function ModalTitle({ selection }: ModalTitleProps) {
  const { data } = useGetTableSelectionInfoQuery(selection);
  if (!data) {
    return null;
  }

  const { unpublished_tables, unpublished_remapped_tables } = data;

  return <>{getTitle(unpublished_tables, unpublished_remapped_tables)}</>;
}

type ModalBodyProps = {
  selection: TableSelectors;
  onPublish?: () => void;
  onClose: () => void;
};

function ModalBody({ selection, onPublish, onClose }: ModalBodyProps) {
  const { data, isLoading, error } = useGetTableSelectionInfoQuery(selection);
  const [publishTables] = usePublishTablesMutation();

  if (isLoading || error != null || data == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { unpublished_tables, unpublished_remapped_tables } = data;

  const handleSubmit = async () => {
    await publishTables(selection).unwrap();
    onPublish?.();
    onClose();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack>
          <Text>{t`Publishing a table saves it to the Library.`}</Text>
          {unpublished_remapped_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(unpublished_tables)}</Text>
              <List spacing="sm">
                {unpublished_remapped_tables.map((table) => (
                  <List.Item key={table.id}>{table.display_name}</List.Item>
                ))}
              </List>
            </>
          )}
          <Group wrap="nowrap">
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={getSubmitButtonLabel(
                unpublished_tables,
                unpublished_remapped_tables,
              )}
              variant="filled"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getTitle(
  unpublishedTables: PublishTableInfo[],
  unpublishedRemappedTables: PublishTableInfo[],
) {
  const isSingleUnpublishedTable = unpublishedTables.length;
  const hasUnpublishedRemappedTables = unpublishedRemappedTables.length > 0;

  if (isSingleUnpublishedTable) {
    return hasUnpublishedRemappedTables
      ? t`Publish ${unpublishedTables[0].display_name} and the tables it depends on?`
      : t`Publish ${unpublishedTables[0]}?`;
  }

  return hasUnpublishedRemappedTables
    ? t`Publish these tables and the tables they depend on?`
    : t`Publish these tables?`;
}

function getForeignKeyMessage(unpublishedTables: PublishTableInfo[]) {
  const isSingleUnpublishedTable = unpublishedTables.length;
  return isSingleUnpublishedTable === 1
    ? jt`Because ${(
        <strong key="table">{unpublishedTables[0].display_name}</strong>
      )} uses foreign keys to display values from other tables, you'll need to publish these, too:`
    : t`Because some of the tables you've selected use foreign keys to display values from other tables, you'll need to publish the tables below, too:`;
}

function getSubmitButtonLabel(
  unpublishedTables: PublishTableInfo[],
  unpublishedRemappedTables: PublishTableInfo[],
) {
  return unpublishedTables.length === 1 &&
    unpublishedRemappedTables.length === 0
    ? t`Publish this table`
    : t`Publish these tables`;
}
