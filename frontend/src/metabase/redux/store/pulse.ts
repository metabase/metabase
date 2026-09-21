import type {
  ChannelApiResponse,
  DashboardSubscription,
  DraftDashboardSubscription,
} from "metabase-types/api";

export interface PulseState {
  editingPulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  pulseList: DashboardSubscription[];
}
