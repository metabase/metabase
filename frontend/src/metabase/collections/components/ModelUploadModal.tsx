import { useState, useMemo, useEffect } from "react";
import { t } from "ttag";
import {
  Modal,
  Button,
  Flex,
  Stack,
  Select,
  Radio,
  Text,
  Icon,
} from "metabase/ui";
import { useSearchListQuery } from "metabase/common/hooks";
import type { CollectionId, TableId, CardId } from "metabase-types/api";

enum UploadMode {
  append = "append",
  create = "create",
}

type CollectionOrTableIdProps =
  | { collectionId: CollectionId; tableId?: never }
  | { collectionId?: never; tableId: TableId; modelId?: CardId };

export function ModelUploadModal({
  opened,
  onClose,
  onUpload,
  collectionId,
}: {
  opened: boolean;
  onClose: () => void;
  onUpload: ({ collectionId, tableId }: CollectionOrTableIdProps) => void;
  collectionId: CollectionId;
}) {
  const [uploadMode, setUploadMode] = useState<UploadMode>(UploadMode.create);
  const [tableId, setTableId] = useState<TableId | null>(null);
  const models = useSearchListQuery({
    query: {
      collection: collectionId,
      models: ["dataset"],
    },
  });

  const uploadableModels = useMemo(
    () => models.data?.filter(model => !!model.based_on_upload) ?? [],
    [models.data],
  );

  const handleUpload = () => {
    if (uploadMode === "append" && tableId) {
      const modelForTableId = uploadableModels.find(
        model => model.based_on_upload === Number(tableId),
      );
      return onUpload({
        tableId: Number(tableId),
        modelId: modelForTableId?.id,
      });
    }

    return onUpload({ collectionId });
  };

  useEffect(() => {
    // if we trigger the modal, and there's no uploadable models, just
    // automatically upload a new one
    if (opened && uploadableModels.length === 0) {
      onUpload({ collectionId });
      onClose();
    }
  }, [onUpload, onClose, collectionId, uploadableModels, opened]);

  if (!uploadableModels?.length) {
    return null;
  }

  const isFormValid = uploadMode === UploadMode.create || !!tableId;

  return (
    <Modal
      opened={opened}
      title={t`Select upload destination`}
      styles={{
        header: { padding: "2.5rem 2.5rem 1.5rem 2.5rem" },
        body: { padding: "0 2.5rem 2.5rem 2.5rem" },
      }}
      onClose={onClose}
    >
      <Stack mb="lg">
        <Text>
          {t`If your CSV has the same columns as a model from a previously uploaded file, you can append data to that model. Otherwise, you can create a new model.`}
        </Text>
        <Radio.Group
          value={uploadMode}
          onChange={(val: UploadMode) => setUploadMode(val)}
        >
          <Radio label={t`Create a new model`} value={UploadMode.create} />
          <Radio
            mt="md"
            label={t`Append to a model`}
            value={UploadMode.append}
          />
        </Radio.Group>
        {uploadMode === UploadMode.append && (
          <Select
            icon={<Icon name="model" />}
            placeholder="Select a model"
            value={tableId ? String(tableId) : ""}
            data={
              uploadableModels.map(model => ({
                value: String(model.based_on_upload),
                label: model.name,
              })) ?? []
            }
            onChange={setTableId}
          />
        )}
      </Stack>

      <Flex justify="flex-end" gap="sm">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleUpload} variant="filled" disabled={!isFormValid}>
          {uploadMode === UploadMode.append ? t`Append` : t`Create`}
        </Button>
      </Flex>
    </Modal>
  );
}
