import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useDeleteTransformsFolderMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { deleteTransformsFolderAndTrack } from "metabase/transforms/analytics";
import {
  Button,
  FocusTrap,
  List,
  Modal,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import { is403Error } from "metabase/utils/errors";
import type { Collection, TransformTarget } from "metabase-types/api";

import type { FolderTransform } from "./types";

type DeleteTransformsFolderModalProps = {
  collection: Collection;
  transforms: FolderTransform[];
  onClose: () => void;
};

/**
 * Deletes a transforms folder, its subfolders and the transforms in them. The output tables stay unless the user
 * chooses to delete them too. There is no undo.
 */
export function DeleteTransformsFolderModal({
  collection,
  transforms,
  onClose,
}: DeleteTransformsFolderModalProps) {
  const [deleteTransformsFolder] = useDeleteTransformsFolderMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [shouldDeleteTables, setShouldDeleteTables] = useState(false);
  const hasTransforms = transforms.length > 0;

  const handleSubmit = async () => {
    try {
      await deleteTransformsFolderAndTrack({
        deleteFolder: () =>
          deleteTransformsFolder({
            id: collection.id,
            "delete-tables": shouldDeleteTables || undefined,
          }).unwrap(),
        collectionId: collection.id,
        deleteTables: shouldDeleteTables,
      });
      sendSuccessToast(t`"${collection.name}" has been deleted`);
    } catch (error) {
      sendErrorToast(getErrorMessage(collection, error));
    } finally {
      onClose();
    }
  };

  return (
    <Modal title={t`Delete "${collection.name}"?`} opened onClose={onClose}>
      <FocusTrap.InitialFocus />
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack gap="xl">
            {hasTransforms ? (
              <TransformsInFolder transforms={transforms} />
            ) : (
              <Text>{t`This will delete the folder and its subfolders. This can’t be undone.`}</Text>
            )}
            {hasTransforms && (
              <Radio.Group
                value={shouldDeleteTables.toString()}
                onChange={(value) => setShouldDeleteTables(value === "true")}
              >
                <Stack gap="sm">
                  <Radio value="false" label={t`Delete the transforms only`} />
                  <Radio
                    value="true"
                    label={t`Delete the transforms and their tables`}
                  />
                </Stack>
              </Radio.Group>
            )}
            {hasTransforms && (
              <Text>{t`Deleting the tables will break queries that used them. This can’t be undone, so please be careful.`}</Text>
            )}
          </Stack>
          <Modal.Footer>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={getSubmitButtonLabel(hasTransforms, shouldDeleteTables)}
              variant="filled"
              color="negative"
            />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
}

function TransformsInFolder({ transforms }: { transforms: FolderTransform[] }) {
  const count = transforms.length;
  return (
    <Stack gap="sm">
      <Text>
        {ngettext(
          msgid`This will also delete the ${count} transform inside it:`,
          `This will also delete the ${count} transforms inside it:`,
          count,
        )}
      </Text>
      <List>
        {transforms.map((transform) => (
          <List.Item key={transform.id}>
            <Text component="span">{transform.name}</Text>
            {transform.target != null && (
              <Text component="span" c="text-secondary">
                {" "}
                ({getTargetTableName(transform.target)})
              </Text>
            )}
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}

function getTargetTableName({ schema, name }: TransformTarget) {
  return schema != null ? `${schema}.${name}` : name;
}

function getErrorMessage(collection: Collection, error: unknown) {
  return is403Error(error)
    ? t`You can’t delete "${collection.name}": it holds a transform you can’t edit, or whose type is not enabled on this instance.`
    : t`"${collection.name}" could not be deleted`;
}

function getSubmitButtonLabel(
  hasTransforms: boolean,
  shouldDeleteTables: boolean,
) {
  if (!hasTransforms) {
    return t`Delete folder`;
  }
  return shouldDeleteTables
    ? t`Delete transforms and tables`
    : t`Delete transforms only`;
}
