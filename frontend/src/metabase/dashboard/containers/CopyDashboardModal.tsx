import { useState } from "react";
import { t } from "ttag";
import { dissoc } from "icepick";
import { push } from "react-router-redux";
import type { Params } from "react-router/lib/Router";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import ModalContent from "metabase/components/ModalContent";

import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import type { Dashboard } from "metabase-types/api";
import {
  type CopyDashboardFormProps,
  type CopyDashboardProperties,
  CopyDashboardForm,
} from "../forms/CopyDashboardForm";
import { getDashboardComplete } from "../selectors";

interface CreateDashboardModalOwnProps
  extends Omit<CopyDashboardFormProps, "onCancel"> {
  onClose?: () => void;
  params: Params;
}

type Props = CreateDashboardModalOwnProps & CopyDashboardFormProps;

const getTitle = (dashboard: Dashboard | null, isShallowCopy: boolean) => {
  if (!dashboard?.name) {
    return "";
  } else if (isShallowCopy) {
    return t`Duplicate "${dashboard.name}"`;
  } else {
    return t`Duplicate "${dashboard.name}" and its questions`;
  }
};

export function CopyDashboardModal({ onClose, params, ...props }: Props) {
  const [isShallowCopy, setIsShallowCopy] = useState(false);

  const originalDashboard = useSelector(getDashboardComplete);
  const dispatch = useDispatch();

  const handleCopy = async (dashboard: CopyDashboardProperties) => {
    const originalDashboardId = Urls.extractEntityId(params.slug);
    const action = await dispatch(
      Dashboards.actions.copy(
        { id: originalDashboardId },
        dissoc(dashboard, "id"),
      ),
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
