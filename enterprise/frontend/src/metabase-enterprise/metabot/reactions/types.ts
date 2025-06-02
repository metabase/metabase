import type { Dispatch, GetState } from "metabase-types/store";

export type ReactionHandler<Reaction> = (
  reaction: Reaction,
) => (reduxApis: {
  dispatch: Dispatch;
  getState: GetState;
}) => void | Promise<void>;
