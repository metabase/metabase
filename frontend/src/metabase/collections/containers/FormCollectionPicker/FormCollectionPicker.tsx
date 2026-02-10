import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  type EntityType,
  canonicalCollectionId,
  isTrashedCollection,
  isValidCollectionId,
} from "metabase/collections/utils";
import { CollectionName } from "metabase/common/components/CollectionName";
import { FormField } from "metabase/common/components/FormField";
import type {
  EntityPickerOptions,
  EntityPickerProps,
  FilterItemsInPersonalCollection,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { SnippetCollectionName } from "metabase/common/components/SnippetCollectionName";
import { TransformCollectionName } from "metabase/common/components/TransformCollectionName";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Collections } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Button, Icon } from "metabase/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

interface FormCollectionPickerProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  entityType?: EntityType;
  collectionPickerModalProps?: Partial<EntityPickerProps>;
  onCollectionSelect?: (collection: OmniPickerItem) => void;
}

function ItemName({
  id,
  namespace = null,
}: {
  id: CollectionId;
  namespace: CollectionNamespace;
}) {
  if (namespace === "snippets") {
    return <SnippetCollectionName id={id} />;
  }

  if (namespace === "transforms") {
    return <TransformCollectionName id={id} />;
  }

  // Check for tenant namespace display name via plugin
  if (id === null) {
    const namespaceDisplayName =
      PLUGIN_TENANTS.getNamespaceDisplayName(namespace);
    if (namespaceDisplayName) {
      return <span>{namespaceDisplayName}</span>;
    }
  }

  return <CollectionName id={id} />;
}

function FormCollectionPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a collection`,
  filterPersonalCollections,
  entityType,
  collectionPickerModalProps,
  onCollectionSelect,
}: FormCollectionPickerProps) {
  const id = useUniqueId();

  const [{ value }, { error, touched }, { setValue }] = useField(name);

  const formFieldRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [openCollectionId] = useState<CollectionId>("root");

  const openCollection = useSelector((state) =>
    Collections.selectors.getObject(state, {
      entityId: openCollectionId,
    }),
  );

  const selectedCollection = useSelector((state) =>
    Collections.selectors.getObject(state, {
      entityId: value,
    }),
  );

  const [collectionNamespace, setCollectionNamespace] =
    useState<CollectionNamespace>(
      selectedCollection?.namespace ??
        collectionPickerModalProps?.namespaces?.[0] ??
        null,
    );

  useEffect(
    function preventUsingArchivedCollection() {
      if (selectedCollection && isTrashedCollection(selectedCollection)) {
        setValue("root", false);
      }
    },
    [setValue, selectedCollection],
  );

  const isOpenCollectionInPersonalCollection = openCollection?.is_personal;
  const showCreateNewCollectionOption =
    filterPersonalCollections !== "only" ||
    isOpenCollectionInPersonalCollection;

  const nonDefaultNamespace =
    collectionPickerModalProps?.namespaces?.[0] ?? null;

  const options = useMemo<EntityPickerOptions>( // FIXME, this should throw more type errors 🤔
    () => ({
      hasPersonalCollections:
        !nonDefaultNamespace && filterPersonalCollections !== "exclude",
      hasRootCollection:
        !!nonDefaultNamespace || filterPersonalCollections !== "only",
      hasSearch: !nonDefaultNamespace,
      hasRecents: !nonDefaultNamespace,
      hasLibrary: !nonDefaultNamespace,
      hasConfirmButtons: true,
      canCreateCollections: showCreateNewCollectionOption,
    }),
    [
      filterPersonalCollections,
      showCreateNewCollectionOption,
      nonDefaultNamespace,
    ],
  );

  const handleChange = useCallback(
    (collection: OmniPickerItem) => {
      onCollectionSelect?.(collection);
      if ("namespace" in collection) {
        setCollectionNamespace(collection.namespace ?? null);
      } else {
        setCollectionNamespace(null);
      }
      setValue(canonicalCollectionId(collection.id));
      setIsPickerOpen(false);
    },
    [onCollectionSelect, setValue],
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
          data-testid="collection-picker-button"
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
          {isValidCollectionId(value) ? (
            <ItemName id={value} namespace={collectionNamespace} />
          ) : (
            placeholder
          )}
        </Button>
      </FormField>
      {isPickerOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{
            id: value,
            model: "collection",
            namespace: collectionNamespace,
          }}
          onChange={handleChange}
          onClose={() => setIsPickerOpen(false)}
          options={options}
          entityType={entityType}
          {...collectionPickerModalProps}
        />
      )}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCollectionPicker;
