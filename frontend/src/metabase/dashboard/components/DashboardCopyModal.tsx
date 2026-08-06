import { useState } from "react";
import { t } from "ttag";

import { useCopyDashboardMutation } from "metabase/api";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import type { CopyDashboardFormProperties } from "metabase/common/components/CopyDashboardForm";
import { CopyModal } from "metabase/common/components/CopyModal";
import { useSelector } from "metabase/redux";
import { useLocation, useNavigate, useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { getDashboardComplete } from "../selectors";

type DashboardCopyModalProps = {
  onClose: () => void;
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

const DashboardCopyModal = ({ onClose }: DashboardCopyModalProps) => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
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
        if (dashboardIdFromSlug == null) {
          throw new Error(
            "Cannot duplicate a dashboard that has not been saved",
          );
        }

        const {
          is_shallow_copy,
          name,
          description,
          collection_id,
          collection_position,
        } = object;
        return await copyDashboard({
          id: dashboardIdFromSlug,
          name,
          description,
          collection_id,
          collection_position,
          is_deep_copy: !is_shallow_copy,
        }).unwrap();
      }}
      onClose={onClose}
      onSaved={(savedDashboard: Dashboard) =>
        navigate(Urls.dashboard(savedDashboard), { replace: true })
      }
      onValuesChange={handleValuesChange}
    />
  );
};

export const DashboardCopyModalConnected = DashboardCopyModal;
