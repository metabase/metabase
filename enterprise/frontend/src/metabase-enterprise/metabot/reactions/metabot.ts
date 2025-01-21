import { push } from "react-router-redux";

import type {
  MetabotRedirectReaction,
  MetabotWriteBackReaction,
} from "metabase-types/api";

import { sendWritebackMessageRequest } from "../state";

import type { ReactionHandler } from "./types";

export const writeBack: ReactionHandler<
  MetabotWriteBackReaction
> = reaction => {
  return async ({ dispatch }) => {
    await dispatch(sendWritebackMessageRequest(reaction.message));
  };
};

export const redirect: ReactionHandler<MetabotRedirectReaction> = reaction => {
  const redirectUrl = new URL(`${window.location.origin}${reaction.url}`);

  return async ({ dispatch }) => {
    await dispatch(
      push({
        pathname: redirectUrl.pathname,
        hash: redirectUrl.hash,
        search: redirectUrl.search,
      }),
    );
  };
};
