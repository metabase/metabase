import { dissoc } from "icepick";
import { t } from "ttag";

import {
  getInstanceAnalyticsCustomCollection,
  isInstanceAnalyticsCollection,
} from "metabase/collections/utils";
import { useCollectionListQuery } from "metabase/common/hooks";
import ModalContent from "metabase/components/ModalContent";
import { CopyDashboardFormConnected } from "metabase/dashboard/containers/CopyDashboardForm";
import { CopyQuestionForm } from "metabase/questions/components/CopyQuestionForm";
import { Flex, Loader } from "metabase/ui";

interface EntityCopyModalProps {
  entityType: string;
  entityObject: any;
  copy: (data: any) => void;
  title?: string;
  onClose: () => void;
  onSaved: (newEntityObject: any) => void;
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
  const { data: collections = [] } = useCollectionListQuery();

  const resolvedObject =
    typeof entityObject?.getPlainObject === "function"
      ? entityObject.getPlainObject()
      : entityObject;

  if (isInstanceAnalyticsCollection(resolvedObject?.collection)) {
    const customCollection = getInstanceAnalyticsCustomCollection(collections);
    if (customCollection) {
      resolvedObject.collection_id = customCollection.id;
    }
  }

  const initialValues = {
    ...dissoc(resolvedObject, "id"),
    name: resolvedObject.name + " - " + t`Duplicate`,
  };

  const renderForm = (props: any) => {
    switch (entityType) {
      case "dashboards":
        return (
          <CopyDashboardFormConnected
            onSubmit={copy}
            onClose={onClose}
            onSaved={onSaved}
            collections={collections}
            {...props}
          />
        );
      case "questions":
        return (
          <CopyQuestionForm
            onSubmit={copy}
            onClose={onClose}
            onSaved={onSaved}
            collections={collections}
            {...props}
          />
        );
    }
  };

  return (
    <ModalContent
      title={title || t`Duplicate "${resolvedObject.name}"`}
      onClose={onClose}
    >
      {!collections?.length ? (
        <Flex justify="center" p="lg">
          <Loader />
        </Flex>
      ) : (
        renderForm({ ...props, initialValues })
      )}
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EntityCopyModal;
