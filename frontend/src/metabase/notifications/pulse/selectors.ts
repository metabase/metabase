import type { ChannelApiResponse } from "metabase-types/api";
import type { DraftDashboardSubscription, State } from "metabase-types/store";

export const getEditingPulse = (state: State): DraftDashboardSubscription =>
  state.pulse.editingPulse;

export const getPulseFormInput = (
  state: State,
): ChannelApiResponse | undefined => state.pulse?.formInput;
