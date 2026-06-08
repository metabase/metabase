import { useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useAdminNotificationDetailQuery,
  useGetCardQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ADMIN_NAVBAR_HEIGHT } from "metabase/nav/constants";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Drawer, Stack } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import { trackAlertsManagementEditClicked } from "../analytics";

import { SidebarBody } from "./SidebarBody";
import { SidebarHeader } from "./SidebarHeader";
import { SIDEBAR_WIDTH } from "./constants";
import type { SidebarProps } from "./types";

export const NotificationDetailSidebar = ({
  notificationId,
  notificationSummary,
  isBulkLoading,
  prevNotificationId,
  nextNotificationId,
  onClose,
  onDelete,
}: SidebarProps) => {
  const { currentData: detail, isFetching: isDetailFetching } =
    useAdminNotificationDetailQuery(notificationId);
  const notification = detail ?? notificationSummary;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setIsEditModalOpen(false);
  }, [notificationId]);

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const cardId = notification?.payload?.card_id;
  const { currentData: card, isFetching: isCardLoading } = useGetCardQuery(
    cardId != null ? { id: cardId } : skipToken,
  );

  useEffect(() => {
    if (card) {
      dispatch(loadMetadataForCard(card));
    }
  }, [card, dispatch]);

  const question = useMemo(
    () => (card ? new Question(card, metadata) : undefined),
    [card, metadata],
  );

  return (
    <>
      <Drawer
        opened
        onClose={onClose}
        position="right"
        size={SIDEBAR_WIDTH}
        withCloseButton={false}
        padding={0}
        withOverlay={false}
        lockScroll={false}
        shadow="lg"
        zIndex={100}
        styles={{
          inner: {
            top: ADMIN_NAVBAR_HEIGHT,
            height: `calc(100vh - ${ADMIN_NAVBAR_HEIGHT})`,
          },
        }}
      >
        <Stack h="100%" p="lg" gap="lg">
          <SidebarHeader
            isBulkLoading={isBulkLoading}
            notificationId={notificationId}
            notification={notification}
            prevNotificationId={prevNotificationId}
            nextNotificationId={nextNotificationId}
            isQuestionLoading={isCardLoading}
            onClose={onClose}
            onDelete={onDelete}
            onEdit={() => {
              trackAlertsManagementEditClicked(notificationId);
              setIsEditModalOpen(true);
            }}
          />
          {notification ? (
            <SidebarBody
              notification={notification}
              detail={detail}
              isDetailFetching={isDetailFetching}
            />
          ) : (
            <LoadingAndErrorWrapper loading />
          )}
        </Stack>
      </Drawer>
      {isEditModalOpen && notification && question && (
        <CreateOrEditQuestionAlertModal
          editingNotification={notification}
          question={question}
          onAlertUpdated={() => setIsEditModalOpen(false)}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </>
  );
};
