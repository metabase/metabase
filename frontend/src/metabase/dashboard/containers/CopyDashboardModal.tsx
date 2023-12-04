import { useState } from "react";
import { t } from "ttag";
import { dissoc } from "icepick";
import { push } from "react-router-redux";
import type { Params } from "react-router/lib/Router";
import { useDispatch } from "metabase/lib/redux";

import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import ModalContent from "metabase/components/ModalContent";

import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import type { Dashboard, DashboardId } from "metabase-types/api";
import { useDashboardQuery } from "metabase/common/hooks";
import {
  type CopyDashboardProperties,
  CopyDashboardForm,
} from "../forms/CopyDashboardForm";

interface CreateDashboardModalOwnProps {
  originalDashboardId?: DashboardId;
  onClose?: () => void;
  params?: Params;
}

type Props = CreateDashboardModalOwnProps;

const getTitle = (dashboard: Dashboard | null, isShallowCopy: boolean) => {
  if (!dashboard?.name) {
    return "";
  } else if (isShallowCopy) {
    return t`Duplicate "${dashboard.name}"`;
  } else {
    return t`Duplicate "${dashboard.name}" and its questions`;
  }
};

export function CopyDashboardModal({
  onClose,
  params,
  originalDashboardId,
  ...props
}: Props) {
  const [isShallowCopy, setIsShallowCopy] = useState(false);

  const dashboardId = originalDashboardId || Urls.extractEntityId(params?.slug);

  const { data: originalDashboard, isLoading } = useDashboardQuery({
    id: dashboardId,
    reload: false,
  });

  const dispatch = useDispatch();

  if (!originalDashboard || isLoading) {
    return null;
  }

  const handleCopy = async (dashboard: CopyDashboardProperties) => {
    const action = await dispatch(
      Dashboards.actions.copy({ id: dashboardId }, dissoc(dashboard, "id")),
    );
    const newDashboard = Dashboards.HACK_getObjectFromAction(action);
    dispatch(push(Urls.dashboard(newDashboard)));
  };

  return (
    <CreateCollectionOnTheGo>
      {({ resumedValues }) => (
        <ModalContent
          title={getTitle(originalDashboard, isShallowCopy)}
          onClose={onClose}
        >
          <CopyDashboardForm
            {...props}
            onCancel={onClose}
            initialValues={{
              ...originalDashboard,
              ...resumedValues,
              is_shallow_copy: false,
            }}
            onIsShallowCopyChange={setIsShallowCopy}
            onCopy={(dashboard: CopyDashboardProperties) =>
              handleCopy(dashboard)
            }
          />
        </ModalContent>
      )}
    </CreateCollectionOnTheGo>
  );
}
