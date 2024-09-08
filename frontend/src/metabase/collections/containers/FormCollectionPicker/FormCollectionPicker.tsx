import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  canonicalCollectionId,
  isTrashedCollection,
  isValidCollectionId,
} from "metabase/collections/utils";
import type {
  CollectionPickerItem,
  CollectionPickerModalProps,
  CollectionPickerOptions,
} from "metabase/common/components/CollectionPicker";
import { CollectionPickerModal } from "metabase/common/components/CollectionPicker";
import type { FilterItemsInPersonalCollection } from "metabase/common/components/EntityPicker";
import CollectionName from "metabase/containers/CollectionName";
import SnippetCollectionName from "metabase/containers/SnippetCollectionName";
import FormField from "metabase/core/components/FormField";
import Collections from "metabase/entities/collections";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useSelector } from "metabase/lib/redux";
import { Button, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

interface FormCollectionPickerProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  zIndex?: number;
  collectionPickerModalProps?: Partial<CollectionPickerModalProps>;
}

function ItemName({
  id,
  type = "collections",
}: {
  id: CollectionId;
  type?: "collections" | "snippet-collections";
}) {
  return type === "snippet-collections" ? (
    <SnippetCollectionName id={id} />
  ) : (
    <CollectionName id={id} />
  );
}

function FormCollectionPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a collection`,
  type = "collections",
  filterPersonalCollections,
  collectionPickerModalProps,
}: FormCollectionPickerProps) {
  const id = useUniqueId();

  const [{ value }, { error, touched }, { setValue }] = useField(name);

  const formFieldRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [openCollectionId] = useState<CollectionId>("root");

  const openCollection = useSelector(state =>
    Collections.selectors.getObject(state, {
      entityId: openCollectionId,
    }),
  );

  const selectedCollection = useSelector(state =>
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

  const options = useMemo<CollectionPickerOptions>(
    () => ({
      showPersonalCollections: filterPersonalCollections !== "exclude",
      showRootCollection: filterPersonalCollections !== "only",
      // Search API doesn't support collection namespaces yet
      showSearch: type === "collections",
      hasConfirmButtons: true,
      namespace: type === "snippet-collections" ? "snippets" : undefined,
      allowCreateNew: showCreateNewCollectionOption,
      hasRecents: type !== "snippet-collections",
    }),
    [filterPersonalCollections, type, showCreateNewCollectionOption],
  );

  const handleChange = useCallback(
    ({ id }: CollectionPickerItem) => {
      setValue(canonicalCollectionId(id));
      setIsPickerOpen(false);
    },
    [setValue],
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
          rightIcon={<Icon name="ellipsis" />}
          styles={{
            inner: {
              justifyContent: "space-between",
            },
            root: { "&:active": { transform: "none" } },
          }}
        >
          {isValidCollectionId(value) ? (
            <ItemName id={value} type={type} />
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
          {...collectionPickerModalProps}
        />
      )}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCollectionPicker;
