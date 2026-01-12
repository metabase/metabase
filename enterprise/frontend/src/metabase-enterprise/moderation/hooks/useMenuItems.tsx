import { t } from "ttag";

import { useEditItemVerificationMutation } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";
import type { Card, Dashboard, ModerationReview } from "metabase-types/api";

import {
  MODERATION_STATUS,
  getLatestModerationReview,
  getStatusIcon,
  isItemVerified,
} from "../service";
import { getVerifyCardTitle } from "../utils";

export const useCardMenuItems = (card: Card, reload?: () => void) => {
  const latestModerationReview = getLatestModerationReview(
    card.moderation_reviews ?? [],
  );

  return useMenuItems({
    reload,
    moderated_item_id: card.id,
    moderated_item_type: "card",
    latestModerationReview,
    title: getVerifyCardTitle(card),
  });
};

export const useDashboardMenuItems = (
  dashboard: Dashboard,
  reload?: () => void,
) => {
  const latestModerationReview = getLatestModerationReview(
    dashboard.moderation_reviews ?? [],
  );

  return useMenuItems({
    reload,
    moderated_item_id: dashboard.id as number,
    moderated_item_type: "dashboard",
    latestModerationReview,
    title: t`Verify this dashboard`,
  });
};

const useMenuItems = ({
  reload,
  moderated_item_id,
  moderated_item_type,
  title,
  latestModerationReview,
}: {
  reload?: () => void;
  moderated_item_id: number;
  moderated_item_type: "card" | "dashboard";
  title: string;
  latestModerationReview?: ModerationReview;
}) => {
  const isModerator = useSelector(getUserIsAdmin);
  const [editItemVerification] = useEditItemVerificationMutation();

  const { name: verifiedIconName } = getStatusIcon(MODERATION_STATUS.verified);

  const isVerified = isItemVerified(latestModerationReview);

  if (isModerator) {
    const testId = isVerified
      ? "moderation-remove-verification-action"
      : "moderation-verify-action";

    return [
      <Menu.Item
        key={testId}
        leftSection={<Icon name={isVerified ? "close" : verifiedIconName} />}
        onClick={async () => {
          if (isVerified) {
            await editItemVerification({
              moderated_item_id,
              moderated_item_type,
              status: null,
            });
          } else {
            await editItemVerification({
              moderated_item_id,
              moderated_item_type,
              status: "verified",
            });
          }

          reload?.();
        }}
        data-testid={testId}
      >
        {isVerified ? t`Remove verification` : title}
      </Menu.Item>,
    ];
  }

  return [];
};
