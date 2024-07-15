import type { Location } from "history";
import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useCollectionQuery } from "metabase/common/hooks";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import CS from "metabase/css/core/index.css";
import {
  cancelEditingDashboard,
  fetchDashboard,
  setSidebar,
} from "metabase/dashboard/actions";
import { useSetDashboardAttributeHandler } from "metabase/dashboard/components/Dashboard/use-set-dashboard-attribute";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardBookmark } from "metabase/dashboard/components/DashboardBookmark";
import {
  getDashboardComplete,
  getHasModelActionsEnabled,
  getIsAdditionalInfoVisible,
  getIsDirty,
  getIsEditing,
} from "metabase/dashboard/selectors";
import type {
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedThemeControls,
} from "metabase/dashboard/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import { getPulseFormInput } from "metabase/pulse/selectors";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getSetting } from "metabase/selectors/settings";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Flex, Loader } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { SIDEBAR_NAME } from "../../constants";
import { ExtraEditButtonsMenu } from "../ExtraEditButtonsMenu/ExtraEditButtonsMenu";

import { DashboardHeaderActionDivider } from "./DashboardHeader.styled";
import { DashboardHeaderComponent } from "./DashboardHeaderView";
import {
  AddActionElementButton,
  AddFilterParameterButton,
  AddHeadingOrTextButton,
  AddLinkCardButton,
  AddQuestionButton,
  AddSectionButton,
  AddTemporalUnitButton,
  CancelEditButton,
  CopyAnalyticsDashboardButton,
  DashboardActionMenu,
  DashboardInfoButton,
  DashboardSubscriptionButton,
  EditDashboardButton,
  FullscreenAnalyticsDashboard,
  SaveEditButton,
  getExtraButtons,
  shouldRenderSubscriptionButton,
} from "./buttons";

export type DashboardHeaderProps = {
  dashboard: Dashboard;
  dashboardBeforeEditing?: Dashboard | null;
  location: Location;
  isAdditionalInfoVisible: boolean;
} & DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  Pick<
    EmbedThemeControls,
    "isNightMode" | "onNightModeChange" | "hasNightModeToggle"
  >;

export const DashboardHeaderInner = ({
  dashboard,
  dashboardBeforeEditing,
  hasNightModeToggle,
  isFullscreen,
  isNightMode,
  location: { pathname, query },
  onFullscreenChange,
  onNightModeChange,
  onRefreshPeriodChange,
  refreshPeriod,
  setRefreshElapsedHook,
}: DashboardHeaderProps) => {
  const handleSetDashboardAttribute = useSetDashboardAttributeHandler();

  const [showCancelWarning, setShowCancelWarning] = useState(false);

  const dispatch = useDispatch();

  useMount(() => {
    dispatch(fetchPulseFormInput());
  });

  const formInput = useSelector(getPulseFormInput);
  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);
  const isAdmin = useSelector(getUserIsAdmin);
  const isAdditionalInfoVisible = useSelector(getIsAdditionalInfoVisible);

  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const isHomepageDashboard = useSelector(
    state =>
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === dashboard?.id,
  );

  const { data: collection, isLoading: isLoadingCollection } =
    useCollectionQuery({ id: dashboard.collection_id || "root" });

  const hasModelActionsEnabled = useSelector(getHasModelActionsEnabled);

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
        queryParams: query,
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

  const getHeaderButtons = () => {
    const canEdit = dashboard.can_write && !dashboard.archived;
    const isAnalyticsDashboard = isInstanceAnalyticsCollection(collection);

    const buttons = [];

    if (isEditing) {
      buttons.push(
        <AddQuestionButton key="add-question-element" />,
        // Text/Headers
        <AddHeadingOrTextButton key="dashboard-add-heading-or-text-button" />,
        // Add link card button
        <AddLinkCardButton key="add-link-card" />,

        <AddSectionButton key="add-section" />,

        // Temporal unit parameters
        <AddTemporalUnitButton key="add-temporal-unit-parameter" />,
        // Filter parameters
        <AddFilterParameterButton key="add-filter-parameter" />,
      );

      if (canEdit && hasModelActionsEnabled) {
        buttons.push(
          <DashboardHeaderActionDivider />,
          <AddActionElementButton key="add-action-element" />,
        );
      }

      // Extra Buttons Menu
      buttons.push(<ExtraEditButtonsMenu key="extra-options-button" />);
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <CopyAnalyticsDashboardButton key="copy-analytics-dashboard" />,
      );
    }

    if (!isFullscreen && !isEditing && canEdit) {
      buttons.push(
        <EditDashboardButton
          key="edit-dashboard-button"
          onRefreshPeriodChange={onRefreshPeriodChange}
        />,
      );
    }

    if (
      shouldRenderSubscriptionButton({
        dashboard,
        canManageSubscriptions,
        formInput,
        isAdmin,
        isEditing,
        isFullscreen,
      })
    ) {
      buttons.push(<DashboardSubscriptionButton />);
    }

    buttons.push(
      ...getDashboardActions({
        dashboard,
        hasNightModeToggle,
        isEditing,
        isFullscreen,
        isNightMode,
        onFullscreenChange,
        onNightModeChange,
        onRefreshPeriodChange,
        refreshPeriod,
        setRefreshElapsedHook,
      }),
    );

    if (!isEditing) {
      buttons.push(
        ...[
          buttons.length > 0 && (
            <DashboardHeaderActionDivider key="dashboard-button-divider" />
          ),
          !dashboard.archived && (
            <DashboardBookmark key="dashboard-bookmark-button" />
          ),
          <DashboardInfoButton key="dashboard-info-button" />,
        ].filter(Boolean),
      );

      if (
        !isFullscreen &&
        !isEditing &&
        !isAnalyticsDashboard &&
        !dashboard.archived
      ) {
        const extraButtons = getExtraButtons({
          onFullscreenChange,
          isFullscreen,
          dashboard,
          canEdit,
          pathname,
        });
        if (extraButtons.length > 0) {
          buttons.push(<DashboardActionMenu items={extraButtons} />);
        }
      }
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <FullscreenAnalyticsDashboard
          isFullscreen={isFullscreen}
          onFullscreenChange={onFullscreenChange}
        />,
      );
    }

    return { buttons };
  };

  if (isLoadingCollection || !collection) {
    return (
      <Flex justify="center" py="1.5rem">
        <Loader size={29} />
      </Flex>
    );
  }

  const hasLastEditInfo = dashboard["last-edit-info"] != null;

  const { buttons: headerButtons } = getHeaderButtons();
  const editingButtons = getEditingButtons();

  return (
    <>
      <DashboardHeaderComponent
        headerClassName={CS.wrapper}
        dashboard={dashboard}
        collection={collection}
        isEditing={isEditing}
        isBadgeVisible={!isEditing && !isFullscreen && isAdditionalInfoVisible}
        isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
        isEditingInfo={isEditing}
        isNavBarOpen={isNavBarOpen}
        headerButtons={headerButtons}
        editWarning={getEditWarning(dashboard)}
        editingTitle={t`You're editing this dashboard.`.concat(
          isHomepageDashboard
            ? t` Remember that this dashboard is set as homepage.`
            : "",
        )}
        editingButtons={editingButtons}
        setDashboardAttribute={handleSetDashboardAttribute}
        onLastEditInfoClick={() =>
          dispatch(setSidebar({ name: SIDEBAR_NAME.info }))
        }
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
