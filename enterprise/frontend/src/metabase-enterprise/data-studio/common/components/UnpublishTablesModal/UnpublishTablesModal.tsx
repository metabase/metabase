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
  useUnpublishTablesMutation,
} from "metabase-enterprise/api";
import type { PublishTableInfo, TableSelectors } from "metabase-types/api";

type UnpublishTablesModalProps = {
  selection: TableSelectors;
  isOpened: boolean;
  onPublish: () => void;
  onClose: () => void;
};

export function UnpublishTablesModal({
  selection,
  isOpened,
  onPublish,
  onClose,
}: UnpublishTablesModalProps) {
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

  const { published_tables, published_remapped_tables } = data;

  return <>{getTitle(published_tables, published_remapped_tables)}</>;
}

type ModalBodyProps = {
  selection: TableSelectors;
  onPublish: () => void;
  onClose: () => void;
};

function ModalBody({ selection, onPublish, onClose }: ModalBodyProps) {
  const { data, isLoading, error } = useGetTableSelectionInfoQuery(selection);
  const [unpublishTables] = useUnpublishTablesMutation();

  if (isLoading || error != null || data == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { published_tables, published_remapped_tables } = data;

  const handleSubmit = async () => {
    await unpublishTables(selection).unwrap();
    onPublish();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack>
          <Text>{t`Publishing a table saves it to the Library.`}</Text>
          {published_remapped_tables.length > 0 && (
            <>
              <Text>{getForeignKeyMessage(published_tables)}</Text>
              <List spacing="sm">
                {published_remapped_tables.map((table) => (
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
                published_tables,
                published_remapped_tables,
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
  publishedTables: PublishTableInfo[],
  publishedRemappedTables: PublishTableInfo[],
) {
  const isSinglePublishedTable = publishedTables.length;
  const hasPublishedRemappedTables = publishedRemappedTables.length > 0;

  if (isSinglePublishedTable) {
    return hasPublishedRemappedTables
      ? t`Unpublish ${publishedTables[0].display_name} and the tables that depend on them?`
      : t`Unpublish ${publishedTables[0]}?`;
  }

  return hasPublishedRemappedTables
    ? t`Unpublish these tables and the tables that depend on them?`
    : t`Unpublish these tables?`;
}

function getForeignKeyMessage(unpublishedTables: PublishTableInfo[]) {
  const isSingleUnpublishedTable = unpublishedTables.length;
  return isSingleUnpublishedTable === 1
    ? jt`Because some of the published tables use foreign keys to display values from ${(
        <strong key="table">{unpublishedTables[0].display_name}</strong>
      )}, you'll need to unpublish these, too:`
    : t`Because some of the published tables use foreign keys to display values from the tables you've selected, you'll need to unpublish the tables below, too:`;
}

function getSubmitButtonLabel(
  publishedTables: PublishTableInfo[],
  publishedRemappedTables: PublishTableInfo[],
) {
  return publishedTables.length === 1 && publishedRemappedTables.length === 0
    ? t`Unpublish this table`
    : t`Unpublish these tables`;
}
