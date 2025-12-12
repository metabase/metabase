import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import FormField from "metabase/common/components/FormField";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Button, Flex, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

interface FormTransformCollectionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
}

function CollectionItemName({ id }: { id: CollectionId }) {
  const { data: collection, isLoading } = useGetCollectionQuery(
    id === "root"
      ? { id: "root", namespace: "transforms" }
      : { id, namespace: "transforms" },
  );

  if (isLoading) {
    return <span>{t`Loading...`}</span>;
  }

  const displayName =
    id === "root" ? t`Transforms` : (collection?.name ?? t`Unknown`);

  return (
    <Flex align="center" gap="sm">
      <Icon name="folder" c="text-medium" />
      {displayName}
    </Flex>
  );
}

export function FormTransformCollectionPicker({
  className,
  style,
  name,
  title = t`Folder`,
}: FormTransformCollectionPickerProps) {
  const id = useUniqueId();

  const [{ value }, { error, touched }, { setValue }] =
    useField<CollectionId | null>(name);

  const formFieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const options = useMemo(
    () => ({
      namespace: "transforms" as const,
      showPersonalCollections: false,
      showRootCollection: true,
      showSearch: true,
      hasConfirmButtons: true,
      allowCreateNew: true,
      hasRecents: false,
      showLibrary: false,
    }),
    [],
  );

  const handleChange = useCallback(
    ({ id }: CollectionPickerItem) => {
      const newValue = id === "root" ? null : id;
      setValue(newValue as CollectionId | null);
      setIsPickerOpen(false);
    },
    [setValue],
  );

  const handleModalClose = useCallback(() => {
    setIsPickerOpen(false);
    buttonRef.current?.focus();
  }, []);

  const pickerValue = useMemo(
    () => ({
      id: value ?? "root",
      model: "collection" as const,
    }),
    [value],
  );

  return (
    <>
      <FormField
        className={className}
        style={style}
        title={title}
        htmlFor={id}
        error={touched ? error : undefined}
        ref={formFieldRef}
      >
        <Button
          data-testid="transform-collection-picker-button"
          ref={buttonRef}
          id={id}
          onClick={() => setIsPickerOpen(true)}
          fullWidth
          rightSection={<Icon name="ellipsis" />}
          styles={{
            inner: {
              justifyContent: "space-between",
            },
            root: { "&:active": { transform: "none" } },
          }}
        >
          {value != null && isValidCollectionId(value) ? (
            <CollectionItemName id={value} />
          ) : (
            <Flex align="center" gap="sm">
              <Icon name="folder" c="text-medium" />
              {t`Transforms`}
            </Flex>
          )}
        </Button>
      </FormField>
      {isPickerOpen && (
        <CollectionPickerModal
          title={t`Select a folder`}
          value={pickerValue}
          onChange={handleChange}
          onClose={handleModalClose}
          options={options}
        />
      )}
    </>
  );
}
