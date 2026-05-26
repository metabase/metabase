import type { DraftDashboardSubscription, State } from "metabase/redux/store";
import type { ChannelApiResponse } from "metabase-types/api";

export const getEditingPulse = (state: State): DraftDashboardSubscription =>
  state.pulse.editingPulse;

export const getPulseFormInput = (
  state: State,
): ChannelApiResponse | undefined => state.pulse?.formInput;
