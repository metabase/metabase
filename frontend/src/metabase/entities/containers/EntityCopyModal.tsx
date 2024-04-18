import { dissoc } from "icepick";
import { t } from "ttag";

import { useCollectionListQuery } from "metabase/common/hooks";
import ModalContent from "metabase/components/ModalContent";
import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import EntityForm from "metabase/entities/containers/EntityForm";
import { Flex, Loader } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";
import type { FormikFormProps } from "formik";
import type { BaseFieldValues } from "metabase-types/forms";
import type { FormContainerProps } from "metabase/containers/FormikForm";

interface EntityCopyModalProps {
  entityType: string;
  entityObject: any; // TODO: Replace. Perhaps it should be a CollectionItem, but QueryModals assigns a collection_id to this object, and CollectionItems don't have those
  copy: (data: any) => void;
  title?: string;
  onClose: () => void;
  onSaved: (newEntityObject: any) => void;
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
}: EntityCopyModalProps & Partial<FormContainerProps<BaseFieldValues>>) => {
  const { data: collections } = useCollectionListQuery();

  return (
    <CreateCollectionOnTheGo>
      {({ resumedValues }) => (
        <ModalContent
          title={title || t`Duplicate "${entityObject.name}"`}
          onClose={onClose}
        >
          {!collections?.length ? (
            <Flex justify="center" p="lg">
              <Loader />
            </Flex>
          ) : (
            <EntityForm
              resumedValues={resumedValues}
              entityType={entityType}
              entityObject={{
                ...dissoc(entityObject, "id"),
                name: entityObject.name + " - " + t`Duplicate`,
              }}
              onSubmit={copy}
              onClose={onClose}
              onSaved={onSaved}
              submitTitle={t`Duplicate`}
              collections={collections}
              {...props}
            />
          )}
        </ModalContent>
      )}
    </CreateCollectionOnTheGo>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityCopyModal;
