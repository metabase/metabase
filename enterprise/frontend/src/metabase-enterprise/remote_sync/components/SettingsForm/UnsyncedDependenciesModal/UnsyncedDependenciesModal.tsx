import { useFormikContext } from "formik";
import { t } from "ttag";

import {
  Button,
  FocusTrap,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import type { RemoteSyncUnsyncedDependency } from "metabase-types/api";

import type { SettingsFormValues } from "../../../types";

import {
  type DependencyGroup,
  type DependencyGroupCollection,
  getDependencyGroups,
} from "./utils";

type UnsyncedDependenciesModalProps = {
  dependencies: RemoteSyncUnsyncedDependency[];
  onClose: () => void;
};

export const UnsyncedDependenciesModal = ({
  dependencies,
  onClose,
}: UnsyncedDependenciesModalProps) => {
  const { submitForm, isSubmitting } = useFormikContext<SettingsFormValues>();

  return (
    <Modal
      opened
      title={t`Synced content uses unsynced content`}
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <Stack gap="lg">
        <Text>{t`Sync the collections this content is in, or remove the references to it.`}</Text>
        {getDependencyGroups(dependencies).map((group) => (
          <DependencyGroupItem key={group.key} group={group} />
        ))}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
          <Button
            variant="filled"
            loading={isSubmitting}
            onClick={submitForm}
          >{t`Save changes`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

type DependencyGroupItemProps = {
  group: DependencyGroup;
};

const DependencyGroupItem = ({ group }: DependencyGroupItemProps) => (
  <Stack gap="sm">
    <Group justify="space-between">
      <Text fw="bold">{group.collection?.name ?? t`Not in a collection`}</Text>
      {group.collection ? (
        <CollectionSyncSwitch collection={group.collection} />
      ) : null}
    </Group>
    {group.dependencies.map((dependency) => (
      <Stack key={`${dependency.model}-${dependency.id}`} gap={0}>
        <Text>{dependency.name}</Text>
        <Text c="text-secondary" fz="sm">
          {t`Used by ${dependency.used_by.map((entity) => entity.name).join(", ")}`}
        </Text>
      </Stack>
    ))}
  </Stack>
);

type CollectionSyncSwitchProps = {
  collection: DependencyGroupCollection;
};

const CollectionSyncSwitch = ({ collection }: CollectionSyncSwitchProps) => {
  const { values, setFieldValue } = useFormikContext<SettingsFormValues>();
  if (!(collection.id in values.collections)) {
    return <Text c="text-secondary">{t`Can't be synced`}</Text>;
  }

  const isSynced = values.collections[collection.id] ?? false;

  const handleChange = (checked: boolean) =>
    setFieldValue("collections", {
      ...values.collections,
      [collection.id]: checked,
    });

  return (
    <Switch
      label={t`Sync`}
      aria-label={t`Sync ${collection.name}`}
      checked={isSynced}
      onChange={(event) => handleChange(event.currentTarget.checked)}
    />
  );
};
