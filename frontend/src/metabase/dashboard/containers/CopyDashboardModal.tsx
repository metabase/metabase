import { t } from "ttag";
import { dissoc } from "icepick";
import { push } from "react-router-redux";
import type { Params } from "react-router/lib/Router";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { CreateCollectionOnTheGo } from "metabase/containers/CreateCollectionOnTheGo";
import ModalContent from "metabase/components/ModalContent";

import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import {
  type CopyDashboardFormOwnProps,
  type CopyDashboardProperties,
  CopyDashboardForm,
} from "../forms/CopyDashboardForm";
import { getDashboardComplete } from "../selectors";

interface CreateDashboardModalOwnProps
  extends Omit<CopyDashboardFormOwnProps, "onCancel"> {
  onClose?: () => void;
  params: Params;
}

type Props = CreateDashboardModalOwnProps & CopyDashboardFormOwnProps;

export function CopyDashboardModal({ onClose, params, ...props }: Props) {
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
        <ModalContent title={t`Copy dashboard`} onClose={onClose}>
          <CopyDashboardForm
            {...props}
            onCancel={onClose}
            initialValues={{ ...originalDashboard, ...resumedValues }}
            onCopy={(dashboard: CopyDashboardProperties) =>
              handleCopy(dashboard)
            }
          />
        </ModalContent>
      )}
    </CreateCollectionOnTheGo>
  );
}
