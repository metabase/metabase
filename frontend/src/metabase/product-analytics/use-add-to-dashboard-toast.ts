import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useLocation, useNavigate } from "metabase/router";

const JUST_CREATED_KEY = "productAnalyticsJustCreated";

/**
 * Router state for the navigation from a new analysis to its saved URL. The
 * save happens on another route, so the saved page is the one that can offer
 * to add the card to a dashboard.
 */
export const JUST_CREATED_STATE = { [JUST_CREATED_KEY]: true };

const isJustCreated = (state: unknown): boolean =>
  typeof state === "object" && state !== null && JUST_CREATED_KEY in state;

/**
 * Right after a new analysis is saved, shows the query builder's "Saved" toast
 * with an "Add this to a dashboard" action. Returns whether the dashboard
 * picker is open.
 */
export const useAddToDashboardToast = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isNewlyCreated] = useState(() => isJustCreated(location.state));
  // Effects run twice in strict mode, and the toast should show once.
  const hasShownToastRef = useRef(false);

  useEffect(() => {
    if (!isNewlyCreated || hasShownToastRef.current) {
      return;
    }
    hasShownToastRef.current = true;
    sendToast({
      message: t`Saved`,
      actionLabel: t`Add this to a dashboard`,
      action: () => setIsPickerOpen(true),
    });
    // Drop the state, so a reload doesn't show the toast again.
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [isNewlyCreated, sendToast, navigate, location]);

  return {
    isPickerOpen,
    closePicker: () => setIsPickerOpen(false),
  };
};
