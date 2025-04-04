import { push } from "react-router-redux";

import type { MetabotRedirectReaction } from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const redirect: ReactionHandler<MetabotRedirectReaction> = (
  reaction,
) => {
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
