import { useField } from "formik";

import { Stack, Switch, Text } from "metabase/ui";
import type { RegularCollectionId } from "metabase-types/api";

import type { SyncableCollection } from "../../../types";

type CollectionsFieldProps = {
  title: string;
  description?: string;
  emptyMessage: string;
  collections: SyncableCollection[];
};

export function CollectionsField({
  title,
  description,
  emptyMessage,
  collections,
}: CollectionsFieldProps) {
  const [{ value }, , { setValue }] =
    useField<Record<RegularCollectionId, boolean>>("collections");

  return (
    <Stack gap="sm">
      <Stack gap="xs">
        <Text fw="bold">{title}</Text>
        {description && (
          <Text c="text-secondary" size="sm">
            {description}
          </Text>
        )}
      </Stack>
      {collections.length === 0 && (
        <Text c="text-secondary">{emptyMessage}</Text>
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
}
