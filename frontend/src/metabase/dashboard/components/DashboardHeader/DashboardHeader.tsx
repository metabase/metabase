import { useDisclosure } from "@mantine/hooks";
import { useMount } from "react-use";
import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { LeaveConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import {
  cancelEditingDashboard,
  fetchDashboard,
  setSidebar,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getIsAdditionalInfoVisible,
  getIsDirty,
  getIsEditing,
} from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
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
};

export const DashboardHeaderInner = ({ dashboard }: DashboardHeaderProps) => {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();

  const dispatch = useDispatch();
  const { isGuestEmbed } = useDashboardContext();

  useMount(() => {
    if (!isGuestEmbed) {
      dispatch(fetchPulseFormInput());
    }
  });

  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);
  const isAdditionalInfoVisible = useSelector(getIsAdditionalInfoVisible);

  const { dashboardBeforeEditing, parameterQueryParams, isFullscreen } =
    useDashboardContext();

  const isHomepageDashboard = useSelector(
    (state) =>
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === dashboard?.id,
  );

  const { data: collection, isLoading: isLoadingCollection } =
    useGetCollectionQuery(
      { id: dashboard.collection_id || "root" },
      {
        skip: isGuestEmbed,
      },
    );

  const onRequestCancel = () => {
    if (isDirty && isEditing) {
      openModal();
    } else {
      onConfirmCancel();
    }
  };

  const onConfirmCancel = () => {
    dispatch(
      fetchDashboard({
        dashId: dashboard.id,
        queryParams: parameterQueryParams ?? {},
        options: { preserveParameters: true },
      }),
    );
    dispatch(cancelEditingDashboard());
    closeModal();
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
          (slug) => !currentSlugs.includes(slug),
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
      <SaveEditButton key="save-edit-button" />,
    ];
  };

  // We don't fetch collection info for static embedding
  if (!isGuestEmbed) {
    if (isLoadingCollection || !collection) {
      return (
        <Flex justify="center" py="1.5rem">
          <Loader size={29} />
        </Flex>
      );
    }
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
          isEmbeddingSdk()
            ? undefined
            : () => {
                dispatch(setSidebar({ name: SIDEBAR_NAME.info }));
              }
        }
      />

      <LeaveConfirmModal
        opened={modalOpened}
        onConfirm={onConfirmCancel}
        onClose={closeModal}
      />
    </>
  );
};

export const DashboardHeader = () => {
  const { dashboard } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return <DashboardHeaderInner dashboard={dashboard} />;
};
