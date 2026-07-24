import { useMemo, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useAddConnectorStreamsMutation,
  useUpdateConnectorConnectionMutation,
} from "metabase-enterprise/api/transform-python";
import type { IngestionConnector } from "metabase-types/api";

import { type ConnectionGroup, getTransformConnector } from "./utils";

type EditConnectionModalProps = {
  connector: IngestionConnector;
  connection: ConnectionGroup;
  onClose: () => void;
};

export function EditConnectionModal({
  connector,
  connection,
  onClose,
}: EditConnectionModalProps) {
  const configFields = connector["config-fields"];
  const [configValues, setConfigValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      configFields.map((field) => [
        field.key,
        connection.config[field.key] ?? "",
      ]),
    ),
  );
  const [token, setToken] = useState("");
  const [addedStreamKeys, setAddedStreamKeys] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [updateConnection, { isLoading: isUpdating }] =
    useUpdateConnectorConnectionMutation();
  const [addStreams, { isLoading: isAddingStreams }] =
    useAddConnectorStreamsMutation();
  const isSaving = isUpdating || isAddingStreams;

  const existingStreamKeys = useMemo(
    () =>
      new Set(
        connection.transforms
          .map((transform) => getTransformConnector(transform)?.stream)
          .filter((key): key is string => key != null),
      ),
    [connection.transforms],
  );

  const isConfigChanged = configFields.some(
    (field) =>
      (configValues[field.key] ?? "").trim() !==
      (connection.config[field.key] ?? ""),
  );
  const hasNewToken = token.trim() !== "";
  const hasNewStreams = addedStreamKeys.length > 0;
  const hasMissingRequiredField = configFields.some(
    (field) => field.required && !configValues[field.key]?.trim(),
  );
  const canSave =
    (isConfigChanged || hasNewToken || hasNewStreams) &&
    !hasMissingRequiredField;

  const toggleAddedStream = (streamKey: string, isChecked: boolean) => {
    setAddedStreamKeys((keys) =>
      isChecked
        ? [...keys, streamKey]
        : keys.filter((key) => key !== streamKey),
    );
  };

  const handleSave = async () => {
    setSaveError(null);
    const anchorTransformId = connection.transforms[0].id;
    try {
      if (isConfigChanged || hasNewToken) {
        const config = Object.fromEntries(
          Object.entries(configValues)
            .map(([key, value]): [string, string] => [key, value.trim()])
            .filter(([, value]) => value !== ""),
        );
        await updateConnection({
          transformId: anchorTransformId,
          ...(isConfigChanged ? { config } : {}),
          ...(hasNewToken ? { auth: { token: token.trim() } } : {}),
        }).unwrap();
      }
      if (hasNewStreams) {
        await addStreams({
          transformId: anchorTransformId,
          streams: addedStreamKeys,
        }).unwrap();
      }
      onClose();
    } catch (error) {
      setSaveError(getErrorMessage(error, t`Could not update the connection`));
    }
  };

  return (
    <Modal
      opened
      title={t`Edit ${connector.name} connection`}
      padding="xl"
      onClose={onClose}
    >
      <Stack gap="md" mt="sm">
        {configFields.map((field) => (
          <TextInput
            key={field.key}
            label={field.label}
            required={field.required}
            value={configValues[field.key] ?? ""}
            onChange={(event) =>
              setConfigValues((values) => ({
                ...values,
                [field.key]: event.target.value,
              }))
            }
          />
        ))}
        <PasswordInput
          label={t`API token`}
          description={t`Leave blank to keep the current token`}
          placeholder={t`New API token`}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <Stack gap="sm">
          <Text fw="bold">{t`What to sync`}</Text>
          {connector.streams.map((stream) => {
            const isExisting = existingStreamKeys.has(stream.key);
            return (
              <Checkbox
                key={stream.key}
                label={stream.label}
                description={stream.description}
                checked={isExisting || addedStreamKeys.includes(stream.key)}
                disabled={isExisting}
                onChange={(event) =>
                  toggleAddedStream(stream.key, event.currentTarget.checked)
                }
              />
            );
          })}
        </Stack>
        {saveError != null && <Alert color="error">{saveError}</Alert>}
        <Group justify="flex-end" mt="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={!canSave}
            loading={isSaving}
            onClick={handleSave}
          >
            {t`Save`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
