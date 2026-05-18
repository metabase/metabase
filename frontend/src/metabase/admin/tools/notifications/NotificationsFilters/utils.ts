import type {
  FilterDraft,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";

export const stateToDraft = (state: NotificationsUrlState): FilterDraft => ({
  channel: state.channel,
  owner_active: state.owner_active,
  last_sent_status: state.last_sent_status,
  recipient_email: state.recipient_email,
});

export const hasActiveFilters = (state: NotificationsUrlState): boolean => {
  if (state.channel !== null) {
    return true;
  }
  if (state.tab !== "failing" && state.last_sent_status !== null) {
    return true;
  }
  if (state.recipient_email !== "") {
    return true;
  }
  return state.tab !== "ownerless" && state.owner_active !== null;
};
