import { dissoc } from "icepick";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/common/collections/hooks";
import { CopyDashboardFormConnected } from "metabase/common/components/CopyDashboardForm";
import { DocumentCopyForm } from "metabase/common/components/DocumentCopyForm/DocumentCopyForm";
import { CopyCardForm } from "metabase/questions/components/CopyCardForm/CopyCardForm";
import { Modal } from "metabase/ui";

import type { CopyModalProps } from "./types";

export function CopyModal(props: CopyModalProps) {
  const {
    entityType,
    entityObject,
    copy,
    title,
    onClose,
    onSaved,
    onValuesChange,
  } = props;

  const resolvedObject =
    typeof entityObject?.getPlainObject === "function"
      ? entityObject.getPlainObject()
      : entityObject;
  const defaultCollectionId = useGetDefaultCollectionId(
    resolvedObject?.collection?.id,
  );

  const resolvedObjectWithDefaultCollection = defaultCollectionId
    ? { ...resolvedObject, collection_id: defaultCollectionId }
    : resolvedObject;

  const initialValues = {
    ...dissoc(resolvedObjectWithDefaultCollection, "id"),
    name: resolvedObjectWithDefaultCollection.name + " - " + t`Duplicate`,
  };

  return (
    <Modal
      title={
        title || t`Duplicate "${resolvedObjectWithDefaultCollection.name}"`
      }
      opened
      onClose={onClose}
    >
      {entityType === "dashboards" && (
        <CopyDashboardFormConnected
          onSubmit={copy}
          onClose={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          onValuesChange={onValuesChange}
          originalDashboardId={resolvedObjectWithDefaultCollection.id}
        />
      )}
      {entityType === "cards" && (
        <CopyCardForm
          onSubmit={copy}
          onCancel={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          model={entityObject?.type}
        />
      )}
      {entityType === "documents" && (
        <DocumentCopyForm
          onSubmit={copy}
          onCancel={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
        />
      )}
    </Modal>
  );
}
