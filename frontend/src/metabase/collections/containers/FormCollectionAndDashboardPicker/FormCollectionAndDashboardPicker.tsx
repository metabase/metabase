import { useField, useFormikContext } from "formik";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGetCollectionQuery, useLazyGetDashboardQuery } from "metabase/api";
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
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Collections } from "metabase/entities/collections";
import { getCollectionIcon } from "metabase/entities/collections/utils";
import { Dashboards } from "metabase/entities/dashboards";
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
  const { data: collection } = useGetCollectionQuery(
    { id: collectionId },
    { skip: !collectionId || dashboardId != null },
  );

  if (dashboardId) {
    return (
      <Flex align="center" gap="sm">
        <Icon name="dashboard" c="brand" />
        <Dashboards.Name id={dashboardId} />
      </Flex>
    );
  }

  const collectionIcon = collection
    ? getCollectionIcon(collection)
    : { name: "collection" as const };

  return (
    <Flex align="center" gap="sm">
      <Icon name={collectionIcon.name} c="brand" />
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
  dashboardTabIdFieldName?: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  entityType?: EntityType;
  zIndex?: number;
  collectionPickerModalProps?: Partial<CollectionPickerModalProps>;
  /**
   * When set to "collection", allows saving to namespace root collections
   * (like tenant root). When null/undefined, namespace roots are disabled.
   */
  savingModel?: "collection" | null;
}

export function FormCollectionAndDashboardPicker({
  className,
  style,
  title,
  placeholder,
  type = "collections",
  filterPersonalCollections,
  collectionPickerModalProps,
  collectionIdFieldName,
  dashboardIdFieldName,
  dashboardTabIdFieldName,
  entityType,
  savingModel,
}: FormCollectionPickerProps) {
  const id = useUniqueId();

  const { setFieldValue } = useFormikContext();

  const collectionField = useField(collectionIdFieldName);
  const [collectionIdInput, collectionIdMeta, collectionIdHelpers] =
    collectionField;

  const dashboardField = useField(dashboardIdFieldName);
  const [dashboardIdInput, dashboardIdMeta, dashboardIdHelpers] =
    dashboardField;

  const pickerTitle = collectionPickerModalProps?.models?.includes("dashboard")
    ? t`Select a collection or dashboard`
    : t`Select a collection`;

  const pickerValue = dashboardIdInput.value
    ? ({ id: dashboardIdInput.value, model: "dashboard" } as const)
    : ({ id: collectionIdInput.value, model: "collection" } as const);

  const touched = dashboardIdMeta.touched || collectionIdMeta.touched;
  const error = dashboardIdMeta.error || collectionIdMeta.error;

  const formFieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const openCollection = useSelector((state) =>
    Collections.selectors.getObject(state, { entityId: "root" }),
  );

  const selectedItem = useSelector(
    (state) =>
      Dashboards.selectors.getObject(state, {
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
      confirmButtonText: (item) =>
        item === "dashboard"
          ? t`Select this dashboard`
          : t`Select this collection`,
      savingModel,
    }),
    [
      filterPersonalCollections,
      type,
      showCreateNewCollectionOption,
      savingModel,
    ],
  );

  const [fetchDashboard] = useLazyGetDashboardQuery();

  const handleChange = useCallback(
    async (item: CollectionPickerItem) => {
      const { id, collection_id, model } = item;
      collectionIdHelpers.setValue(
        canonicalCollectionId(model === "dashboard" ? collection_id : id),
      );
      const dashboardId = model === "dashboard" ? id : undefined;
      dashboardIdHelpers.setValue(dashboardId);

      // preload dashboard tabs before the picker closes for better UX, but only if tab field is tracked
      if (dashboardTabIdFieldName) {
        try {
          const dashboard = dashboardId
            ? await fetchDashboard({ id: dashboardId }).then((res) => res.data)
            : undefined;
          const defaultTabId = dashboard?.tabs?.length
            ? String(dashboard.tabs[0].id)
            : undefined;
          setFieldValue(dashboardTabIdFieldName, defaultTabId);
        } catch (err) {
          console.error(err);
          setFieldValue(dashboardTabIdFieldName, undefined);
        }
      }

      setIsPickerOpen(false);
    },
    [
      collectionIdHelpers,
      dashboardIdHelpers,
      dashboardTabIdFieldName,
      setFieldValue,
      fetchDashboard,
    ],
  );

  const handleModalClose = () => {
    setIsPickerOpen(false);
    // restore focus to form element so if Esc key is pressed multiple times,
    // nested modals close in sequence
    buttonRef.current?.focus();
  };

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
          data-testid="dashboard-and-collection-picker-button"
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
          {isValidCollectionId(collectionIdInput.value) ||
          !!dashboardIdInput.value ? (
            <ItemName
              collectionId={collectionIdInput.value}
              dashboardId={dashboardIdInput.value}
              type={type}
            />
          ) : (
            (placeholder ?? pickerTitle)
          )}
        </Button>
      </FormField>
      {isPickerOpen && (
        <CollectionPickerModal
          title={pickerTitle}
          value={pickerValue}
          onChange={handleChange}
          onClose={handleModalClose}
          options={options}
          entityType={entityType}
          {...collectionPickerModalProps}
        />
      )}
    </>
  );
}
