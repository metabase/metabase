import { dissoc } from "icepick";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import ModalContent from "metabase/components/ModalContent";
import { CopyDashboardFormConnected } from "metabase/dashboard/containers/CopyDashboardForm";
import { CopyQuestionForm } from "metabase/questions/components/CopyQuestionForm";

interface EntityCopyModalProps {
  entityType: string;
  entityObject: any;
  copy: (data: any) => Promise<any>;
  title?: string;
  onClose: () => void;
  onSaved: (newEntityObject?: any) => void;
  overwriteOnInitialValuesChange?: boolean;
  onValuesChange?: (values: Record<string, unknown>) => void;
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

  return (
    <ModalContent
      title={title || t`Duplicate "${resolvedObject.name}"`}
      onClose={onClose}
    >
      {entityType === "dashboards" && (
        <CopyDashboardFormConnected
          onSubmit={copy}
          onClose={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          {...props}
        />
      )}
      {entityType === "questions" && (
        <CopyQuestionForm
          onSubmit={copy}
          onCancel={onClose}
          onSaved={onSaved}
          initialValues={initialValues}
          {...props}
        />
      )}
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityCopyModal;
