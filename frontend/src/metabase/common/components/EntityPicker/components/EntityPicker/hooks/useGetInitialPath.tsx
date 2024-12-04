import {
  CollectionId,
  DashboardId,
  CardId,
  CollectionItemModel,
  CollectionItemId,
} from "metabase-types/api";
import {
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import { useMemo } from "react";
import {
  getCollectionIdPath,
  getQuestionPickerValueModel,
  getStateFromIdPath,
} from "../utils";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

export const useGetInitialPath = (
  models: CollectionItemModel[],
  options? = {},
  initialValue?: {
    id: CollectionId | DashboardId | CardId;
    model: CollectionItemModel;
  },
) => {
  const isCollection = initialValue?.model === "collection";
  const isDashboard = initialValue?.model === "dashboard";
  const isQuestion =
    (initialValue &&
      ["card", "dataset", "metric"].includes(initialValue.model)) ||
    false;

  const {
    path: collectionPath,
    selectedItem: selectedCollection,
    isLoading: isLoadingCollectionPath,
    collection,
  } = useGetCollectionPath({
    enable: isCollection,
    id: initialValue?.id,
    models,
    options,
  });

  const {
    path: dashboardPath,
    selectedItem: selectedDashboard,
    isLoading: isLoadingDashboardPath,
    collection: dashboardCollection,
  } = useGetDashboardPath({
    enable: isDashboard,
    id: initialValue?.id,
    models,
    options,
  });

  const {
    path: questionPath,
    selectedItem: selectedQuestion,
    isLoading: isLoadingQuestionPath,
    collection: questionCollection,
  } = useGetQuestionPath({
    enable: isQuestion,
    id: initialValue?.id,
    models,
    options,
  });

  const retval = {
    path: collectionPath || dashboardPath || questionPath,
    selectedItem: selectedCollection || selectedDashboard || selectedQuestion,
    isLoading:
      isLoadingCollectionPath ||
      isLoadingDashboardPath ||
      isLoadingQuestionPath,
    collection: collection || dashboardCollection || questionCollection,
  };

  return retval;
};

const useGetDashboardPath = ({
  enable,
  id,
  models,
  options,
}: {
  enable: boolean;
  id?: DashboardId;
  models: CollectionItemModel[];
}) => {
  const { data: dashboard, isLoading } = useGetDashboardQuery(
    { id },
    { skip: !(enable && id) },
  );

  const {
    path,
    isLoading: isLoadingCollectionPath,
    collection,
  } = useGetCollectionPath({
    enable: !isLoading && enable,
    id: dashboard?.collection?.id,
    models,
    options,
  });

  if (path) {
    path[path.length - 1].selectedItem = {
      id: dashboard?.id as CollectionItemId,
      name: dashboard?.name,
      model: "dashboard" as const,
      effective_location: collection?.effective_location,
      location: collection?.location,
    };
  }

  return {
    path,
    selectedItem: {
      id: dashboard?.id as CollectionItemId,
      name: dashboard?.name,
      model: "dashboard" as const,
      effective_location: collection?.effective_location,
      location: collection?.location,
    },
    isLoading: isLoading || isLoadingCollectionPath,
    collection,
  };
};

const useGetQuestionPath = ({
  enable,
  id,
  models,
  options,
}: {
  enable: boolean;
  id?: CardId;
  models: CollectionItemModel[];
}) => {
  const { data: card, isLoading } = useGetCardQuery(
    { id },
    { skip: !(enable && id) },
  );

  const {
    path,
    isLoading: isLoadingCollectionPath,
    collection,
  } = useGetCollectionPath({
    enable: !isLoading && enable,
    id: card?.collection?.id,
    models,
    options,
  });

  if (path) {
    path[path.length - 1].selectedItem = {
      id: card?.id as CollectionItemId,
      name: card?.name,
      model: card?.type ? getQuestionPickerValueModel(card?.type) : null,
      effective_location: collection?.effective_location,
      location: collection?.location,
    };
  }

  return {
    path,
    selectedItem: {
      id: card?.id as CollectionItemId,
      name: card?.name,
      model: card?.type ? getQuestionPickerValueModel(card?.type) : null,
      effective_location: collection?.effective_location,
      location: collection?.location,
    },
    isLoading: isLoading || isLoadingCollectionPath,
    collection,
  };
};

const useGetCollectionPath = ({
  enable,
  id,
  models,
  options,
}: {
  enable: boolean;
  id?: CollectionId;
  models: CollectionItemModel[];
}) => {
  const { data: collection, isLoading } = useGetCollectionQuery(
    {
      id: isValidCollectionId(id) ? id || "root" : "root",
    },
    { skip: !enable },
  );
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const { path, selectedItem } = useMemo(() => {
    if (collection) {
      const path = getStateFromIdPath({
        idPath: getCollectionIdPath(
          {
            id: collection.id,
            location: collection.effective_location,
            is_personal: collection.is_personal,
          },
          userPersonalCollectionId,
        ),
        models,
        namespace: options.namespace,
      });

      const selectedItem = collection.can_write
        ? {
            id: collection.id as CollectionItemId,
            name: collection.name,
            model: "collection" as const,
            // effective_location: collection.effective_location,
            // location: collection.location,
            ...collection,
          }
        : null;

      path[path.length - 1].selectedItem = selectedItem;

      return {
        path,
        selectedItem,
        collection,
      };
    }
    return {};
  }, [collection, isLoading, userPersonalCollectionId]);

  return { isLoading, path, selectedItem, collection };
};
