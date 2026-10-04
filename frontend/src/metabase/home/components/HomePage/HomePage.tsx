import { useLayoutEffect } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import {
  isLibraryCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHomepageDashboard } from "metabase/common/hooks/use-homepage-dashboard";
import { useDispatch, useSelector } from "metabase/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { addUndo } from "metabase/redux/undo";
import { getHasDismissedCustomHomePageToast } from "metabase/selectors/app";
import { getIsAllClientUser } from "metabase/selectors/user";
import * as Urls from "metabase/urls";

import { HomeContent } from "../HomeContent";
import { HomeLayout } from "../HomeLayout";

export const HomePage = (): JSX.Element => {
  const { isLoadingDash } = useDashboardRedirect();
  const { isRedirectingClient } = useClientCollectionRedirect();
  if (isLoadingDash || isRedirectingClient) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
};

/**
 * ALL Tecnologias: usuário de grupo de cliente não vê a página inicial;
 * vai direto para a primeira coleção liberada para ele.
 */
const useClientCollectionRedirect = () => {
  const isAllClientUser = useSelector(getIsAllClientUser);
  const dispatch = useDispatch();
  const { data: collections, isLoading } = useListCollectionsTreeQuery(
    isAllClientUser
      ? { "exclude-archived": true, "exclude-other-user-collections": true }
      : skipToken,
  );

  const target = collections?.find(
    (collection) =>
      !isRootPersonalCollection(collection) &&
      !isRootTrashCollection(collection) &&
      !isLibraryCollection(collection),
  );

  useLayoutEffect(() => {
    if (isAllClientUser && target) {
      dispatch(replace(Urls.collection(target)));
    }
  }, [isAllClientUser, target, dispatch]);

  return { isRedirectingClient: isAllClientUser && (isLoading || !!target) };
};

const useDashboardRedirect = () => {
  const { dashboardId, dashboard, isLoading } = useHomepageDashboard();
  const hasDismissedToast = useSelector(getHasDismissedCustomHomePageToast);
  const dispatch = useDispatch();

  // This redirect must live inside a useLayoutEffect to prevent the browser from painting a frame of <HomeContent>
  // before firing the redirect (metabase#69917)
  useLayoutEffect(() => {
    if (dashboardId && !isLoading && !dashboard?.archived) {
      dispatch(
        replace({
          pathname: `/dashboard/${dashboardId}`,
          state: { preserveNavbarState: true },
        }),
      );

      if (!hasDismissedToast) {
        dispatch(
          addUndo({
            message: t`Your admin has set this dashboard as your homepage`,
            icon: "info",
            timeout: 10000,
            action: () => {
              dispatch(
                updateUserSetting({
                  key: "dismissed-custom-dashboard-toast",
                  value: true,
                }),
              );
            },
            actionLabel: t`Got it`,
            canDismiss: false,
          }),
        );
      }
    }
  }, [
    dashboardId,
    hasDismissedToast,
    dispatch,
    dashboard?.archived,
    isLoading,
  ]);

  return {
    isLoadingDash: isLoading,
  };
};
