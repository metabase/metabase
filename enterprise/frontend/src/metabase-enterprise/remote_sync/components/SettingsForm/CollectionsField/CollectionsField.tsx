import { useField } from "formik";
import { t } from "ttag";

import { Stack, Switch, Text } from "metabase/ui";

import type { SyncableCollection } from "../../../types";

type CollectionsFieldProps = {
  collections: SyncableCollection[];
};

export const CollectionsField = ({ collections }: CollectionsFieldProps) => {
  const [{ value }, , { setValue }] =
    useField<Record<number, boolean>>("collections");

  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Collections to sync`}</Text>
      {collections.length === 0 && (
        <Text c="text-secondary">{t`There are no top-level collections yet.`}</Text>
      )}
      {collections.map((collection) => (
        <Switch
          key={collection.id}
          label={collection.name}
          checked={value[collection.id] ?? false}
          onChange={(event) =>
            setValue({ ...value, [collection.id]: event.currentTarget.checked })
          }
        />
      ))}
    </Stack>
  );
};
