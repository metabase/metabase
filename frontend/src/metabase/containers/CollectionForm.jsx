import React from "react";
import { t } from "c-3po";
import EntityForm from "metabase/entities/containers/EntityForm";
import ModalContent from "metabase/components/ModalContent";

const CollectionForm = ({ collection, onClose, ...props }) => (
  <ModalContent
    title={
      collection && collection.id != null ? collection.name : t`New collection`
    }
    onClose={onClose}
  >
    <EntityForm entityType="collections" entityObject={collection} {...props} />
  </ModalContent>
);

export default CollectionForm;
