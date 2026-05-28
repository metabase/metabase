import type {
  FilterDraft,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";

export const stateToDraft = (state: NotificationsUrlState): FilterDraft => ({
  channel: state.channel,
  creator_active: state.creator_active,
  last_send_status: state.last_send_status,
  recipient_email: state.recipient_email,
});

export const hasActiveFilters = (state: NotificationsUrlState): boolean => {
  if (state.channel.length > 0) {
    return true;
  }
  if (state.tab !== "failing" && state.last_send_status !== null) {
    return true;
  }
  if (state.recipient_email !== "") {
    return true;
  }
  return state.tab !== "ownerless" && state.creator_active !== null;
};
