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
  CollectionPickerOptions,
} from "metabase/common/components/CollectionPicker";
import {
  DashboardPickerModal,
  type DashboardPickerModalProps,
} from "metabase/common/components/DashboardPicker";
import type { FilterItemsInPersonalCollection } from "metabase/common/components/EntityPicker";
import CollectionName from "metabase/containers/CollectionName";
import SnippetCollectionName from "metabase/containers/SnippetCollectionName";
import FormField from "metabase/core/components/FormField";
import Collections from "metabase/entities/collections";
import Dashboard from "metabase/entities/dashboards";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Icon } from "metabase/ui";
import type { CollectionId, DashboardId } from "metabase-types/api";

function ItemName({
  collectionId,
  dashboardId,
  type,
}: {
  collectionId: CollectionId;
  dashboardId: DashboardId;
  type?: "collections" | "snippet-collections";
}) {
  if (dashboardId) {
    return (
      <Flex align="center" gap="sm">
        <Icon name="dashboard" color={color("brand")} />
        <Dashboard.Name id={dashboardId} />
      </Flex>
    );
  }

  return (
    <Flex align="center" gap="sm">
      <Icon name="collection" color={color("brand")} />
      {type === "snippet-collections" ? (
        <SnippetCollectionName id={collectionId} />
      ) : (
        <CollectionName id={collectionId} />
      )}
    </Flex>
  );
}

interface FormCollectionPickerProps extends HTMLAttributes<HTMLDivElement> {
  collectionIdFieldName: string;
  dashboardIdFieldName: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  zIndex?: number;
  dashboardPickerModalProps?: Partial<DashboardPickerModalProps>;
}

export function FormCollectionAndDashboardPicker({
  className,
  style,
  title,
  placeholder = t`Select a collection or dashboard`,
  type = "collections",
  filterPersonalCollections,
  dashboardPickerModalProps,
  collectionIdFieldName,
  dashboardIdFieldName,
}: FormCollectionPickerProps) {
  const id = useUniqueId();

  const collectionField = useField(collectionIdFieldName);

  const [collectionIdInput, collectionIdMeta, collectionIdHelpers] =
    collectionField;
  const dashboardField = useField(dashboardIdFieldName);
  const [dashboardIdInput, dashboardIdMeta, dashboardIdHelpers] =
    dashboardField;

  const pickerValue = dashboardIdInput.value
    ? ({ id: dashboardIdInput.value, model: "dashboard" } as const)
    : ({ id: collectionIdInput.value, model: "collection" } as const);

  const touched = dashboardIdMeta.touched || collectionIdMeta.touched;
  const error = dashboardIdMeta.error || collectionIdMeta.error;

  const formFieldRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const openCollection = useSelector(state =>
    Collections.selectors.getObject(state, { entityId: "root" }),
  );

  const selectedItem = useSelector(
    state =>
      Dashboard.selectors.getObject(state, {
        entityId: dashboardIdInput.value,
      }) ||
      Collections.selectors.getObject(state, {
        entityId: collectionIdInput.value,
      }),
  );

  useEffect(
    function preventUsingArchivedItem() {
      if (
        selectedItem &&
        (isTrashedCollection(selectedItem) || selectedItem.archived)
      ) {
        collectionIdHelpers.setValue("root", false);
        dashboardIdHelpers.setValue(undefined, false);
      }
    },
    [collectionIdHelpers, dashboardIdHelpers, selectedItem],
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
    (item: CollectionPickerItem) => {
      const { id, collection_id, model } = item;
      collectionIdHelpers.setValue(
        canonicalCollectionId(model === "dashboard" ? collection_id : id),
      );
      dashboardIdHelpers.setValue(model === "dashboard" ? id : undefined);
      setIsPickerOpen(false);
    },
    [collectionIdHelpers, dashboardIdHelpers],
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
          {isValidCollectionId(collectionIdInput.value) ||
          !!dashboardIdInput.value ? (
            <ItemName
              collectionId={collectionIdInput.value}
              dashboardId={dashboardIdInput.value}
              type={type}
            />
          ) : (
            placeholder
          )}
        </Button>
      </FormField>
      {isPickerOpen && (
        <>
          <DashboardPickerModal
            title={t`Save this question to a dashboard`}
            value={pickerValue}
            onChange={handleChange}
            onClose={() => setIsPickerOpen(false)}
            options={options}
            canSelectCollection
            {...dashboardPickerModalProps}
          />
        </>
      )}
    </>
  );
}
