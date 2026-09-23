import { skipToken } from "@reduxjs/toolkit/query/react";
import { useEffect, useMemo, useState } from "react";

import { useGetNotificationQuery } from "metabase/api";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import {
  type AlertDescription,
  buildAlertPrompt,
  parseAlertDescription,
  parseAlertRunAiOutput,
} from "metabase/metabot/utils/alert-prompt";
import { Route, useNavigate, useSearchParams } from "metabase/router";
import { Loader } from "metabase/ui";
import type { Notification } from "metabase-types/api";

function parseAlertId(value: string | null): number | null {
  const id = Number(value);
  return value && Number.isInteger(id) && id > 0 ? id : null;
}

function getSavedAlertDescription(
  notification: Notification | undefined,
): AlertDescription | null {
  const card = notification?.payload?.card;
  if (!notification || !card) {
    return null;
  }
  return {
    card,
    send_condition: notification.payload?.send_condition,
    subscription: notification.subscriptions[0],
  };
}

// Alert emails link here with the alert (a saved alert's id, or an unsaved one's description), when it was sent,
// and Metabot's output for that run (if any).
function useAlertPrompt(searchParams: URLSearchParams) {
  const alertParam = searchParams.get("alert");
  const alertId = parseAlertId(alertParam);
  const sentAt = searchParams.get("sent_at");
  const encodedAiOutput = searchParams.get("ai");
  const { data: notification, isLoading } = useGetNotificationQuery(
    alertId ?? skipToken,
  );

  const prompt = useMemo(() => {
    const alert =
      alertId == null
        ? parseAlertDescription(alertParam)
        : getSavedAlertDescription(notification);
    if (!alert) {
      return "";
    }
    return buildAlertPrompt({
      alert,
      sentAt,
      aiOutput: parseAlertRunAiOutput(encodedAiOutput),
    });
  }, [alertId, alertParam, notification, sentAt, encodedAiOutput]);

  return { isAlert: alertParam != null, prompt, isLoading };
}

function MetabotNewRoute() {
  const [searchParams] = useSearchParams();
  const { canUseMetabot, isLoading: isLoadingPermissions } =
    useUserMetabotPermissions();
  const alertPrompt = useAlertPrompt(searchParams);
  const { submitInput } = useMetabotAgent("omnibot");
  const prompt = alertPrompt.isAlert
    ? alertPrompt.prompt
    : (searchParams.get("q") ?? "");
  const isLoading = isLoadingPermissions || alertPrompt.isLoading;
  const navigate = useNavigate();
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (isLoading || hasSubmitted) {
      return;
    }

    navigate("/", { replace: true });

    if (prompt && canUseMetabot) {
      void submitInput(prompt, { focusInput: true });
      setHasSubmitted(true);
    }
  }, [isLoading, canUseMetabot, prompt, submitInput, hasSubmitted, navigate]);

  return <Loader m="5rem auto" display="block" size="xl" />;
}

export const getMetabotQuickLinks = () => {
  return (
    <Route key="metabot" path="metabot/new" element={<MetabotNewRoute />} />
  );
};
