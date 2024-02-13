import { dissoc } from "icepick";
import { t } from "ttag";

import EntityForm from "metabase/entities/containers/EntityForm";
import ModalContent from "metabase/components/ModalContent";
import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import { useCollectionListQuery } from "metabase/common/hooks";
import { Flex, Loader } from "metabase/ui";

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
}: EntityCopyModalProps) => {
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
