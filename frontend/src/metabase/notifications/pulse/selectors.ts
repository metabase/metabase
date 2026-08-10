import type { State } from "metabase/redux/store";
import type {
  ChannelApiResponse,
  DraftDashboardSubscription,
} from "metabase-types/api";

export const getEditingPulse = (state: State): DraftDashboardSubscription =>
  state.pulse.editingPulse;

export const getPulseFormInput = (
  state: State,
): ChannelApiResponse | undefined => state.pulse?.formInput;
