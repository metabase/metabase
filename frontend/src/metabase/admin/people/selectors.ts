import { createSelector } from "@reduxjs/toolkit";

import { ACTIVE_USERS_NUDGE_THRESHOLD } from "metabase/admin/people/constants";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

export const getUserTemporaryPassword = (
  state: State,
  props: { userId: number },
) => state.admin.people.temporaryPasswords[props.userId];

export const shouldNudgeToPro = createSelector(
  (state) => getSetting(state, "token-features"),
  (state) => getUserIsAdmin(state),
  (state) => getSetting(state, "active-users-count"),
  (tokenFeatures, isAdmin, numActiveUsers) => {
    return (
      !hasAnySsoFeature(tokenFeatures) &&
      isAdmin &&
      numActiveUsers >= ACTIVE_USERS_NUDGE_THRESHOLD
    );
  },
);

export const shouldShowTenantsUpsell = createSelector(
  (state) => getSetting(state, "setup-embedding-autoenabled"),
  (state) => getSetting(state, "embedding-homepage"),
  (state) => getSetting(state, "token-features"),
  (wasEmbeddingAutoenabled, embeddingHomepage, tokenFeatures) => {
    // Older web setup flows only persisted this broader embedding interest
    // signal, while the SDK CLI already persisted setup-embedding-autoenabled.
    const hasEmbeddingSetupSignal =
      Boolean(wasEmbeddingAutoenabled) || embeddingHomepage === "visible";

    return hasEmbeddingSetupSignal && !tokenFeatures?.tenants;
  },
);
