import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import { t } from "ttag";
import { useField } from "formik";

import { is } from "immer/dist/internal";
import { filter } from "underscore";
import { useUniqueId } from "metabase/hooks/use-unique-id";

import FormField from "metabase/core/components/FormField";
import SelectButton from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Collections from "metabase/entities/collections";

import CollectionName from "metabase/containers/CollectionName";
import SnippetCollectionName from "metabase/containers/SnippetCollectionName";
import { CreateCollectionOnTheGoButton } from "metabase/containers/CreateCollectionOnTheGo";

import { canonicalCollectionId , isValidCollectionId } from "metabase/collections/utils";

import type { CollectionId } from "metabase-types/api";

import { useSelector } from "metabase/lib/redux";
import type { FilterItemsInPersonalCollection } from "metabase/containers/ItemPicker";
import { EntityPickerModal } from "metabase/common/components/EntityPicker";


export interface FormCollectionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
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
}: FormCollectionPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const formFieldRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>("root");

  console.log({ openCollectionId})

  const openCollection = useSelector(state =>
    Collections.selectors.getObject(state, {
      entityId: openCollectionId,
    }),
  );

  const isOpenCollectionInPersonalCollection = openCollection?.is_personal;
  const showCreateNewCollectionOption =
    filterPersonalCollections !== "only" ||
    isOpenCollectionInPersonalCollection;

  // Search API doesn't support collection namespaces yet
  const hasSearch = type === "collections";
  const isSnippetCollection = type === "snippet-collections";

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
        <SelectButton onClick={() => setIsPickerOpen(true)}>
          {isValidCollectionId(value) ? (
            <ItemName id={value} type={type} />
          ) : (
            placeholder
          )}
        </SelectButton>
      </FormField>
      {isPickerOpen && (
        <EntityPickerModal
          title={t`Select a collection`}
          tabs={["collection"]}
          value={{ id: value, model: 'collection' }}
          onChange={({ id }) => {
            setValue(canonicalCollectionId(id));
            setIsPickerOpen(false)
          }}
          onClose={() => setIsPickerOpen(false)}
          options={{
            showPersonalCollections: filterPersonalCollections !== "exclude",
            showRootCollection: filterPersonalCollections !== "only",
            showSearch: hasSearch,
            hasConfirmButtons: true,
            namespace: isSnippetCollection ? "snippets" : undefined,
            allowCreateNew: showCreateNewCollectionOption,
          }}
        />
      )}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCollectionPicker;
