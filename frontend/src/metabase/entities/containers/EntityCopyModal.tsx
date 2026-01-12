import { dissoc } from "icepick";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import {
  CopyDashboardFormConnected,
  type CopyDashboardFormProperties,
} from "metabase/dashboard/containers/CopyDashboardForm";
import { DocumentCopyForm } from "metabase/documents/components/DocumentCopyForm/DocumentCopyForm";
import { CopyCardForm } from "metabase/questions/components/CopyCardForm/CopyCardForm";
import { Modal } from "metabase/ui";

interface EntityCopyModalProps {
  entityType: string;
  entityObject: any;
  copy: (data: any) => Promise<any>;
  title?: string;
  onClose: () => void;
  onSaved: (newEntityObject?: any) => void;
  overwriteOnInitialValuesChange?: boolean;
  onValuesChange?: (values: CopyDashboardFormProperties) => void;
  form?: any;
}

const EntityCopyModal = ({
  entityType,
  entityObject,
  copy,
  title,
  onClose,
  onSaved,
  ...props
}: EntityCopyModalProps) => {
  const resolvedObject =
    typeof entityObject?.getPlainObject === "function"
      ? entityObject.getPlainObject()
      : entityObject;
  const defaultCollectionId = useGetDefaultCollectionId(
    resolvedObject?.collection?.id,
  );

  if (defaultCollectionId) {
    resolvedObject.collection_id = defaultCollectionId;
  }

  const initialValues = {
    ...dissoc(resolvedObject, "id"),
    name: resolvedObject.name + " - " + t`Duplicate`,
  };

  useEscapeToCloseModal(onClose);

  return (
    <Modal
      title={title || t`Duplicate "${resolvedObject.name}"`}
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
          {...props}
          originalDashboardId={resolvedObject.id}
        />
      )}
      {entityType === "cards" && (
        <CopyCardForm
          onSubmit={copy}
          onCancel={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          model={entityObject?.type}
          {...props}
        />
      )}
      {entityType === "documents" && (
        <DocumentCopyForm
          onSubmit={copy}
          onCancel={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          {...props}
        />
      )}
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityCopyModal;
