import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseAnonymousReachQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

/**
 * The panel's write state: the routing enable, the attribute, and the grant decision, whose
 * invariants only hold as a set. `skip` suppresses its queries for a panel that is not rendered.
 */
export const useDatabaseRoutingPanel = (
  database: Database,
  { skip }: { skip: boolean },
) => {
  const [sendToast] = useToast();
  const isAdmin = useSelector(getUserIsAdmin);
  const [updateRouterDatabase, { error }] = useUpdateRouterDatabaseMutation();

  // The anonymous-reach endpoint is admin-only.
  const { data: anonymousReach } = useGetDatabaseAnonymousReachQuery(
    skip || !isAdmin ? skipToken : database.id,
  );
  const anonymouslyReachable = (anonymousReach?.total ?? 0) > 0;

  const userAttribute = database.router_user_attribute ?? undefined;
  const isRoutingStored = hasDbRoutingEnabled(database);

  const [tempEnabled, setTempEnabled] = useState(false);
  const enabled = tempEnabled || isRoutingStored;

  const anonymousAccessGranted = !!database.router_anonymous_access_granted;
  // There is nothing to store the grant against until an attribute has been stored.
  const canChangeAnonymousAccess = isRoutingStored;

  // A database whose routing has only just been switched on has stopped nothing yet, and a
  // granted router still serves them.
  const hasStoppedServingAnonymousVisitors =
    isRoutingStored && !anonymousAccessGranted && anonymouslyReachable;

  const chooseUserAttribute = async (attribute: string) => {
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: attribute,
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    sendToast({
      message: isRoutingStored
        ? t`Database routing updated`
        : t`Database routing enabled`,
    });
  };

  const changeAnonymousAccess = async (granted: boolean) => {
    if (!userAttribute) {
      return;
    }
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: userAttribute,
      anonymous_access_granted: granted,
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    sendToast({
      message: granted
        ? t`Anonymous access allowed`
        : t`Anonymous access disallowed`,
    });
  };

  const toggleRouting = async (nextEnabled: boolean) => {
    if (nextEnabled) {
      setTempEnabled(true);
      return;
    }
    setTempEnabled(false);
    if (!isRoutingStored) {
      return;
    }
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: null,
    });
    if (!("error" in result)) {
      sendToast({ message: t`Database routing disabled` });
    }
  };

  return {
    /** The routing switch, which a pending enable checks before anything is stored. */
    enabled,
    /** The stored attribute routing matches on, which is also the select's value. */
    userAttribute,
    isRoutingStored,
    /** The last failed write, rendered inline by the panel. */
    error,
    anonymousAccessGranted,
    canChangeAnonymousAccess,
    hasStoppedServingAnonymousVisitors,
    toggleRouting,
    chooseUserAttribute,
    changeAnonymousAccess,
  };
};
