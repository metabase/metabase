import type {
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";

export interface PulseState {
  editingPulse: DashboardSubscription;
  formInput: ChannelApiResponse;
  cardPreviews: Record<number, { id: number }>;
  pulseList: DashboardSubscription[];
}
