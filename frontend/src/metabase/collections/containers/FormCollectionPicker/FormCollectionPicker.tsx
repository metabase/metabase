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
import type { FilterItemsInPersonalCollection } from "metabase/common/components/EntityPicker";
import { FormField } from "metabase/common/components/FormField";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
  type CollectionPickerModalProps,
  type CollectionPickerOptions,
} from "metabase/common/components/Pickers/CollectionPicker";
import { SnippetCollectionName } from "metabase/common/components/SnippetCollectionName";
import { TransformCollectionName } from "metabase/common/components/TransformCollectionName";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Collections } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Button, Icon } from "metabase/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

const NAMESPACE_BY_TYPE: Record<string, "snippets" | "transforms"> = {
  "snippet-collections": "snippets",
  "transform-collections": "transforms",
};

interface FormCollectionPickerProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections" | "transform-collections";
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  entityType?: EntityType;
  collectionPickerModalProps?: Partial<CollectionPickerModalProps>;
  onCollectionSelect?: (collection: CollectionPickerItem) => void;
  /**
   * When set to "collection", allows saving to namespace root collections
   * (like tenant root). When null/undefined, namespace roots are disabled.
   */
  savingModel?: "collection" | null;
}

function ItemName({
  id,
  type = "collections",
  namespace = null,
}: {
  id: CollectionId;
  type?: "collections" | "snippet-collections" | "transform-collections";
  namespace?: string | null;
}) {
  if (type === "snippet-collections") {
    return <SnippetCollectionName id={id} />;
  }

  if (type === "transform-collections") {
    return <TransformCollectionName id={id} />;
  }

  // Check for tenant namespace display name via plugin
  if (id === null) {
    const namespaceDisplayName = PLUGIN_TENANTS.getNamespaceDisplayName(
      namespace as CollectionNamespace,
    );
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
  type = "collections",
  filterPersonalCollections,
  entityType,
  collectionPickerModalProps,
  savingModel,
  onCollectionSelect,
}: FormCollectionPickerProps) {
  const id = useUniqueId();

  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const [collectionNamespace, setCollectionNamespace] = useState<string | null>(
    null,
  );

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

  const namespace = NAMESPACE_BY_TYPE[type];

  const options = useMemo<CollectionPickerOptions>(
    () => ({
      showPersonalCollections:
        !namespace && filterPersonalCollections !== "exclude",
      showRootCollection: !!namespace || filterPersonalCollections !== "only",
      showSearch: !namespace,
      hasConfirmButtons: true,
      namespace,
      allowCreateNew: showCreateNewCollectionOption,
      hasRecents: !namespace,
      showLibrary: !namespace,
      savingModel,
    }),
    [
      filterPersonalCollections,
      namespace,
      showCreateNewCollectionOption,
      savingModel,
    ],
  );

  const handleChange = useCallback(
    (collection: CollectionPickerItem) => {
      onCollectionSelect?.(collection);
      setCollectionNamespace(collection.namespace ?? null);
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
            <ItemName id={value} type={type} namespace={collectionNamespace} />
          ) : (
            placeholder
          )}
        </Button>
      </FormField>
      {isPickerOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{ id: value, model: "collection" }}
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
