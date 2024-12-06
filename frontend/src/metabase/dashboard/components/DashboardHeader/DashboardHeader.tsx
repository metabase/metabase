import type { Query } from "history";
import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import {
  cancelEditingDashboard,
  fetchDashboard,
  setSidebar,
} from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getIsAdditionalInfoVisible,
  getIsDirty,
  getIsEditing,
} from "metabase/dashboard/selectors";
import type {
  DashboardFullscreenControls,
  DashboardNightModeControls,
  DashboardRefreshPeriodControls,
} from "metabase/dashboard/types";
import { isEmbeddingSdk } from "metabase/env";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { fetchPulseFormInput } from "metabase/notifications/pulse/actions";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Loader } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { SIDEBAR_NAME } from "../../constants";

import { DashboardHeaderView } from "./DashboardHeaderView";
import { CancelEditButton, SaveEditButton } from "./buttons";

export type DashboardHeaderProps = {
  dashboard: Dashboard;
  dashboardBeforeEditing?: Dashboard | null;
  parameterQueryParams: Query;
  isAdditionalInfoVisible: boolean;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  DashboardNightModeControls;

export const DashboardHeaderInner = ({
  dashboard,
  dashboardBeforeEditing,
  hasNightModeToggle,
  isFullscreen,
  isNightMode,
  parameterQueryParams,
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
}: DashboardHeaderProps) => {
  const [showCancelWarning, setShowCancelWarning] = useState(false);

  const dispatch = useDispatch();

  useMount(() => {
    dispatch(fetchPulseFormInput());
  });

  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);
  const isAdditionalInfoVisible = useSelector(getIsAdditionalInfoVisible);

  const isHomepageDashboard = useSelector(
    state =>
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === dashboard?.id,
  );

  const { data: collection, isLoading: isLoadingCollection } =
    useGetCollectionQuery({ id: dashboard.collection_id || "root" });

  const onRequestCancel = () => {
    if (isDirty && isEditing) {
      setShowCancelWarning(true);
    } else {
      onCancel();
    }
  };

  const onCancel = () => {
    dispatch(
      fetchDashboard({
        dashId: dashboard.id,
        queryParams: parameterQueryParams,
        options: { preserveParameters: true },
      }),
    );
    dispatch(cancelEditingDashboard());
  };

  const getEditWarning = (dashboard: Dashboard) => {
    if (dashboard.embedding_params) {
      const currentSlugs = Object.keys(dashboard.embedding_params);
      // are all of the original embedding params keys in the current
      // embedding params keys?
      if (
        isEditing &&
        dashboardBeforeEditing?.embedding_params &&
        Object.keys(dashboardBeforeEditing.embedding_params).some(
          slug => !currentSlugs.includes(slug),
        )
      ) {
        return t`You've updated embedded params and will need to update your embed code.`;
      }
    }
  };

  const getEditingButtons = () => {
    return [
      <CancelEditButton
        key="cancel-edit-button"
        onClick={() => onRequestCancel()}
      />,
      <SaveEditButton
        key="save-edit-button"
        onDoneEditing={() => {
          onRefreshPeriodChange(null);
        }}
      />,
    ];
  };

  if (isLoadingCollection || !collection) {
    return (
      <Flex justify="center" py="1.5rem">
        <Loader size={29} />
      </Flex>
    );
  }

  const hasLastEditInfo = dashboard["last-edit-info"] != null;

  const editingButtons = getEditingButtons();

  return (
    <>
      <DashboardHeaderView
        dashboard={dashboard}
        collection={collection}
        isBadgeVisible={!isEditing && !isFullscreen && isAdditionalInfoVisible}
        isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
        editWarning={getEditWarning(dashboard)}
        editingTitle={t`You're editing this dashboard.`.concat(
          isHomepageDashboard
            ? t` Remember that this dashboard is set as homepage.`
            : "",
        )}
        editingButtons={editingButtons}
        onLastEditInfoClick={
          isEmbeddingSdk
            ? undefined
            : () => {
                dispatch(setSidebar({ name: SIDEBAR_NAME.info }));
              }
        }
        refreshPeriod={refreshPeriod}
        onRefreshPeriodChange={onRefreshPeriodChange}
        setRefreshElapsedHook={setRefreshElapsedHook}
        isFullscreen={isFullscreen}
        onFullscreenChange={onFullscreenChange}
        hasNightModeToggle={hasNightModeToggle}
        onNightModeChange={onNightModeChange}
        isNightMode={isNightMode}
      />

      <Modal isOpen={showCancelWarning}>
        <LeaveConfirmationModalContent
          onAction={onCancel}
          onClose={() => setShowCancelWarning(false)}
        />
      </Modal>
    </>
  );
};

export const DashboardHeader = (props: DashboardHeaderProps) => {
  const dashboard = useSelector(getDashboardComplete);

  if (!dashboard) {
    return null;
  }

  return <DashboardHeaderInner {...props} />;
};
