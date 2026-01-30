import type {
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getEditingPulse = (state: State): DashboardSubscription =>
  state.pulse.editingPulse;

export const getPulseFormInput = (
  state: State,
): ChannelApiResponse | undefined => state.pulse?.formInput;
