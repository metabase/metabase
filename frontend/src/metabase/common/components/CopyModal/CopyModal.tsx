import { dissoc } from "icepick";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { CopyDashboardFormConnected } from "metabase/common/components/CopyDashboardForm";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { DocumentCopyForm } from "metabase/documents/components/DocumentCopyForm/DocumentCopyForm";
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

  useEscapeToCloseModal(onClose);

  return (
    <Modal
      title={
        title || t`Duplicate "${resolvedObjectWithDefaultCollection.name}"`
      }
      opened
      onClose={onClose}
      closeOnEscape={false}
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
