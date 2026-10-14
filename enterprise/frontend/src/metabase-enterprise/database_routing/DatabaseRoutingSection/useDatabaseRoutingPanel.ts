import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseAnonymousReachQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

import type { AnonymousAccessQuestion } from "../AnonymousAccessChoiceModal";

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

  const [pendingAnonymousAccess, setPendingAnonymousAccess] = useState<
    boolean | undefined
  >(undefined);
  const [attributeAwaitingAnswer, setAttributeAwaitingAnswer] = useState<
    string | undefined
  >(undefined);
  // The prop lags a successful store by a refetch.
  const [sentAttribute, setSentAttribute] = useState<string | undefined>(
    undefined,
  );

  const routerAttribute = userAttribute ?? sentAttribute;
  const pendingGrant = isRoutingStored ? undefined : pendingAnonymousAccess;
  const anonymousAccessGranted =
    pendingGrant ?? !!database.router_anonymous_access_granted;
  const canChangeAnonymousAccess =
    isRoutingStored || pendingGrant !== undefined;

  const hasStoppedServingAnonymousVisitors =
    isRoutingStored && !anonymousAccessGranted && anonymouslyReachable;

  const mustAnswerBeforeStoring =
    !isRoutingStored && anonymouslyReachable && pendingGrant === undefined;
  // Derived: reachability can load after the toggle.
  const isChoosingGrant =
    mustAnswerBeforeStoring &&
    (tempEnabled || attributeAwaitingAnswer !== undefined);

  const openQuestion: AnonymousAccessQuestion | null = isChoosingGrant
    ? "choose"
    : null;

  const storeRouter = async (
    attribute: string,
    granted: boolean | undefined,
  ) => {
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: attribute,
      // An omitted grant leaves the stored one alone.
      ...(granted !== undefined && { anonymous_access_granted: granted }),
    });
    // resolves, not rejects, on failure
    if ("error" in result) {
      return;
    }
    setSentAttribute(attribute);
    sendToast({
      message: isRoutingStored
        ? t`Database routing updated`
        : t`Database routing enabled`,
    });
  };

  const chooseUserAttribute = async (attribute: string) => {
    if (mustAnswerBeforeStoring) {
      setAttributeAwaitingAnswer(attribute);
      return;
    }
    await storeRouter(attribute, pendingGrant);
  };

  const writeAnonymousAccess = async (attribute: string, granted: boolean) => {
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: attribute,
      anonymous_access_granted: granted,
    });
    if ("error" in result) {
      return;
    }
    // Shown until the refetch lands.
    setPendingAnonymousAccess(granted);
    sendToast({
      message: granted
        ? t`Anonymous access allowed`
        : t`Anonymous access disallowed`,
    });
  };

  const changeAnonymousAccess = async (granted: boolean) => {
    if (!routerAttribute) {
      setPendingAnonymousAccess(granted);
      return;
    }
    await writeAnonymousAccess(routerAttribute, granted);
  };

  const discardPendingRouting = () => {
    setTempEnabled(false);
    setPendingAnonymousAccess(undefined);
    setAttributeAwaitingAnswer(undefined);
    setSentAttribute(undefined);
  };

  const toggleRouting = async (nextEnabled: boolean) => {
    if (nextEnabled) {
      setTempEnabled(true);
      return;
    }
    discardPendingRouting();
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

  const chooseGrant = async (granted: boolean) => {
    setPendingAnonymousAccess(granted);
    if (attributeAwaitingAnswer === undefined) {
      return;
    }
    setAttributeAwaitingAnswer(undefined);
    await storeRouter(attributeAwaitingAnswer, granted);
  };

  return {
    /** True from a pending enable, before anything is stored. */
    enabled,
    userAttribute,
    isRoutingStored,
    error,
    anonymousAccessGranted,
    canChangeAnonymousAccess,
    hasStoppedServingAnonymousVisitors,
    openQuestion,
    cancelUndoesEnable: tempEnabled,
    toggleRouting,
    chooseUserAttribute,
    changeAnonymousAccess,
    chooseGrant,
    cancelGrantChoice: discardPendingRouting,
  };
};
