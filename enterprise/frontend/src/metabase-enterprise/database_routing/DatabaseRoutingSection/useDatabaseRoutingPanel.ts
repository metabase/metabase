import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetDatabaseUsageInfoQuery } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { hasDbRoutingEnabled } from "metabase/common/utils/database";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useUpdateRouterDatabaseMutation } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

import type { AnonymousAccessQuestion } from "../AnonymousAccessChoiceModal";

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

  // usage info is admin-only, and the fact is only there to inform the admin making the decision
  const { data: usageInfo, isLoading: isReachabilityPending } =
    useGetDatabaseUsageInfoQuery(skip || !isAdmin ? skipToken : database.id);
  const anonymouslyReachable = !!usageInfo?.anonymously_reachable;
  // Settled either way. A failed request counts: no honest question can be put without the fact.
  const isReachabilityKnown = !isReachabilityPending;

  const userAttribute = database.router_user_attribute ?? undefined;
  const isRoutingStored = hasDbRoutingEnabled(database);

  const [tempEnabled, setTempEnabled] = useState(false);
  const enabled = tempEnabled || isRoutingStored;

  // Held until a user attribute carries it to the server in the same request.
  const [pendingAnonymousAccess, setPendingAnonymousAccess] = useState<
    boolean | undefined
  >(undefined);
  // The attribute waiting on an answer, when the admin reached the select without being asked.
  const [attributeAwaitingAnswer, setAttributeAwaitingAnswer] = useState<
    string | undefined
  >(undefined);
  // The prop lags a successful store by a refetch, so remember what went to the server.
  const [sentAttribute, setSentAttribute] = useState<string | undefined>(
    undefined,
  );
  // A revoke the admin has asked for and not yet confirmed. Nothing has been sent.
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState(false);

  const routerAttribute = userAttribute ?? sentAttribute;
  // Once routing is stored the grant lives on the server, so the held answer has done its work.
  const pendingGrant = isRoutingStored ? undefined : pendingAnonymousAccess;
  const anonymousAccessGranted =
    pendingGrant ?? !!database.router_anonymous_access_granted;
  const canChangeAnonymousAccess =
    isRoutingStored || pendingGrant !== undefined;

  // Only a revoke needs the fact; granting widens what works, so it is never held.
  const isRevokeHeldForReachability =
    anonymousAccessGranted && !isReachabilityKnown;

  // A just-toggled database was asked instead, and a granted router still serves them.
  const hasStoppedServingAnonymousVisitors =
    isRoutingStored && !anonymousAccessGranted && anonymouslyReachable;

  // The invariant: a router is never stored without the grant decision attached.
  const mustAnswerBeforeStoring =
    !isRoutingStored && anonymouslyReachable && pendingGrant === undefined;
  // Derived, so it survives the toggle beating the reachability fact. The chevron only discloses.
  const isChoosingGrant =
    mustAnswerBeforeStoring &&
    (tempEnabled || attributeAwaitingAnswer !== undefined);

  const openQuestion: AnonymousAccessQuestion | null = isConfirmingRevoke
    ? "revoke"
    : isChoosingGrant
      ? "choose"
      : null;

  const storeRouter = async (
    attribute: string,
    granted: boolean | undefined,
  ) => {
    const result = await updateRouterDatabase({
      id: database.id,
      user_attribute: attribute,
      // An omitted grant leaves the stored one alone, so only a first enable carries the answer.
      ...(granted !== undefined && { anonymous_access_granted: granted }),
    });
    // the trigger resolves rather than rejects on failure; the error is rendered inline
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
    // the trigger resolves rather than rejects on failure; the error is rendered inline
    if ("error" in result) {
      return;
    }
    // Outranks the prop until the refetch lands, for a router the panel has not seen stored.
    setPendingAnonymousAccess(granted);
    sendToast({
      message: granted
        ? t`Anonymous access allowed`
        : t`Anonymous access disallowed`,
    });
  };

  const changeAnonymousAccess = async (granted: boolean) => {
    // With no stored attribute there is nothing to store the grant against, so it keeps waiting.
    if (!routerAttribute) {
      setPendingAnonymousAccess(granted);
      return;
    }
    // Revoking takes data away from visitors being served right now; granting never does.
    if (!granted && anonymouslyReachable) {
      setIsConfirmingRevoke(true);
      return;
    }
    await writeAnonymousAccess(routerAttribute, granted);
  };

  // Nothing reaches the server until an attribute does, so abandoning only drops local state.
  const discardPendingRouting = () => {
    setTempEnabled(false);
    setIsConfirmingRevoke(false);
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

  // The confirmation can only mean the revoke the admin asked for, so it carries no answer.
  const confirmRevoke = async () => {
    setIsConfirmingRevoke(false);
    // the question is only raised once an attribute exists to write the grant against
    if (routerAttribute) {
      await writeAnonymousAccess(routerAttribute, false);
    }
  };

  // Declining leaves the grant exactly as it was, with nothing sent.
  const dismissRevoke = () => setIsConfirmingRevoke(false);

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
    /** The question being asked, or null. */
    openQuestion,
    /** Whether cancelling the grant choice also takes the section's expansion down with it. */
    cancelUndoesEnable: tempEnabled,
    isRevokeHeldForReachability,
    toggleRouting,
    chooseUserAttribute,
    changeAnonymousAccess,
    chooseGrant,
    cancelGrantChoice: discardPendingRouting,
    confirmRevoke,
    dismissRevoke,
  };
};
