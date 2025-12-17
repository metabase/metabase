import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
} from "metabase/common/components/Pickers/CollectionPicker";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Button, Flex, Icon, Input } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { TRANSFORM_COLLECTION_PICKER_OPTIONS } from "./constants";

interface TransformCollectionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  label?: string;
}

export function TransformCollectionPicker({
  className,
  style,
  name,
  label = t`Collection`,
}: TransformCollectionPickerProps) {
  const id = useUniqueId();

  const [{ value }, { error, touched }, { setValue }] =
    useField<CollectionId | null>(name);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const collectionId = canonicalCollectionId(value);

  const { data: collection } = useGetCollectionQuery(
    collectionId ? { id: collectionId, namespace: "transforms" } : skipToken,
  );

  const displayName = collectionId ? (collection?.name ?? "") : t`Transforms`;

  const handleChange = useCallback(
    ({ id }: CollectionPickerItem) => {
      setValue(canonicalCollectionId(id));
      setIsPickerOpen(false);
    },
    [setValue],
  );

  const handleClose = useCallback(() => {
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
      <Input.Wrapper
        className={className}
        style={style}
        label={label}
        id={id}
        error={touched ? error : undefined}
      >
        <Button
          data-testid="transform-collection-picker-button"
          ref={buttonRef}
          id={id}
          onClick={() => setIsPickerOpen(true)}
          fullWidth
          rightSection={<Icon name="ellipsis" />}
          styles={{
            inner: { justifyContent: "space-between" },
            root: { "&:active": { transform: "none" } },
          }}
        >
          <Flex align="center" gap="sm">
            <Icon name="folder" c="text-medium" />
            {displayName}
          </Flex>
        </Button>
      </Input.Wrapper>
      {isPickerOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={pickerValue}
          onChange={handleChange}
          onClose={handleClose}
          options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
        />
      )}
    </>
  );
}
