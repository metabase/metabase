import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useSearchListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import type { SearchResult } from "metabase-types/api";

export const BrowseRedirect = () => {
  const defaultTab = localStorage.getItem("defaultBrowseTab");

  const shouldQueryModels = !defaultTab;

  const {
    data: models,
    error,
    isLoading,
  } = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
    enabled: shouldQueryModels,
  });

  const dispatch = useDispatch();

  useEffect(() => {
    switch (defaultTab) {
      case "models":
        dispatch(replace("/browse/models"));
        break;
      case "databases":
        dispatch(replace("/browse/databases"));
        break;
      default:
        if (models !== undefined) {
          if (models.length > 0) {
            dispatch(replace("/browse/models"));
          } else {
            dispatch(replace("/browse/databases"));
          }
        }
        if (!error && !isLoading) {
          dispatch(replace("/browse/models"));
        }
    }
  }, [models, defaultTab, dispatch, error, isLoading]);

  if (error || isLoading) {
    return (
      <LoadingAndErrorWrapper
        error={error}
        loading={isLoading}
        style={{ display: "flex", flex: 1 }}
      />
    );
  }

  return null;
};
