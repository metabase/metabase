/* eslint-disable react/prop-types */
import { dissoc } from "icepick";
import { t } from "ttag";

import EntityForm from "metabase/entities/containers/EntityForm";
import ModalContent from "metabase/components/ModalContent";

interface EntityCopyModalProps {
  entityType: string;
  entityObject: any;
  copy: (data: any) => void;
  title?: string;
  onClose: () => void;
  onSaved: () => void;
}

const EntityCopyModal = ({
  entityType,
  entityObject,
  copy,
  title,
  onClose,
  onSaved,
  ...props
}: EntityCopyModalProps) => (
  <ModalContent
    title={title || t`Duplicate "${entityObject.name}"`}
    onClose={onClose}
  >
    <EntityForm
      entityType={entityType}
      entityObject={{
        ...dissoc(entityObject, "id"),
        name: entityObject.name + " - " + t`Duplicate`,
      }}
      onSubmit={copy}
      onClose={onClose}
      onSaved={onSaved}
      submitTitle={t`Duplicate`}
      {...props}
    />
  </ModalContent>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityCopyModal;
