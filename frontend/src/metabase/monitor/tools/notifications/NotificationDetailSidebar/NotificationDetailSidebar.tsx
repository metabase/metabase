import { useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useAdminNotificationDetailQuery,
  useGetCardQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Stack } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import { trackAlertsManagementEditClicked } from "../analytics";

import S from "./NotificationDetailSidebar.module.css";
import { SidebarBody } from "./SidebarBody";
import { SidebarHeader } from "./SidebarHeader";
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
  const {
    currentData: detail,
    error: detailError,
    isFetching: isDetailFetching,
  } = useAdminNotificationDetailQuery(notificationId);
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
      <Flex
        className={S.sidebar}
        direction="column"
        h="100%"
        flex="1 1 auto"
        miw={0}
        style={{
          borderLeft: "1px solid var(--mb-color-border-neutral)",
        }}
        bg="background_page-primary"
        data-testid="notification-detail-sidebar"
      >
        <Stack h="100%" p="lg" gap="lg" style={{ overflowY: "auto" }}>
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
          {detailError ? (
            <LoadingAndErrorWrapper error={detailError} />
          ) : notification ? (
            <SidebarBody
              notification={notification}
              detail={detail}
              isDetailFetching={isDetailFetching}
            />
          ) : (
            <LoadingAndErrorWrapper loading={isDetailFetching} />
          )}
        </Stack>
      </Flex>
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
