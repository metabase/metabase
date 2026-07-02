import type { Location } from "history";
import { dissoc } from "icepick";
import { useState } from "react";
import { withRouter } from "react-router";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { useCopyDashboardMutation } from "metabase/api";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import type { CopyDashboardFormProperties } from "metabase/common/components/CopyDashboardForm";
import { CopyModal } from "metabase/common/components/CopyModal";
import { useDispatch, useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { getDashboardComplete } from "../selectors";

type DashboardCopyModalProps = {
  onClose: () => void;
  params: { slug?: string };
  location: Location;
};

const getTitle = (
  dashboard: Dashboard | null,
  isShallowCopy: boolean,
): string => {
  if (!dashboard?.name) {
    return "";
  }

  return isShallowCopy
    ? t`Duplicate "${dashboard.name}"`
    : t`Duplicate "${dashboard.name}" and its questions`;
};

const DashboardCopyModal = ({
  onClose,
  params,
  location,
}: DashboardCopyModalProps) => {
  const dispatch = useDispatch();
  const [copyDashboard] = useCopyDashboardMutation();
  const dashboard = useSelector(getDashboardComplete);
  const initialCollectionId = useInitialCollectionId({
    collectionId: dashboard?.collection_id,
    params,
    location,
  });
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const dashboardIdFromSlug = Urls.extractEntityId(params?.slug);

  const title = getTitle(dashboard, isShallowCopy);

  const handleValuesChange = (values: CopyDashboardFormProperties) => {
    if (
      "is_shallow_copy" in values &&
      typeof values.is_shallow_copy === "boolean"
    ) {
      setIsShallowCopy(values.is_shallow_copy);
    }
  };

  return (
    <CopyModal
      entityType="dashboards"
      entityObject={{
        ...dashboard,
        collection_id: initialCollectionId,
      }}
      title={title}
      overwriteOnInitialValuesChange
      copy={async (object) => {
        const { is_shallow_copy, ...overrides } = dissoc(object, "id");
        return await copyDashboard({
          id: dashboardIdFromSlug,
          ...overrides,
          is_deep_copy: !is_shallow_copy,
        }).unwrap();
      }}
      onClose={onClose}
      onSaved={(savedDashboard: Dashboard) =>
        dispatch(replace(Urls.dashboard(savedDashboard)))
      }
      onValuesChange={handleValuesChange}
    />
  );
};

export const DashboardCopyModalConnected = withRouter(DashboardCopyModal);
