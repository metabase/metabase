import { replace } from "react-router-redux";
import { useEffect } from "react";
import type { SearchResult } from "metabase-types/api";
import { useSearchListQuery } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { getDefaultBrowseTab } from "../selectors";

export const BrowseRedirect = () => {
  const defaultTab = useSelector(getDefaultBrowseTab);

  const shouldQueryModels = !defaultTab;

  const modelsResult = useSearchListQuery<SearchResult>({
    query: {
      models: ["dataset"],
      filter_items_in_personal_collection: "exclude",
    },
    enabled: shouldQueryModels,
  });
  const { data: models, error, isLoading } = modelsResult;

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
        if (models) {
          if (models.length > 0) {
            dispatch(replace("/browse/models"));
          } else {
            dispatch(replace("/browse/databases"));
          }
        }
    }
  }, [models, defaultTab, dispatch]);

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
