import { useEffect, useRef } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { useSetting, useStoreUrl, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { useLicense } from "metabase-enterprise/settings/hooks/use-license";

const NOTIFICATION_TIMEOUT = 30_000;

/**
 * This hook allows to create an upsell flow that listens to the events from the Store tab
 *   and sends back results of token activation to the Store
 */
export function useUpsellFlow({
  campaign,
  location,
}: {
  campaign: string;
  location: string;
}) {
  const storeWindowRef = useRef<WindowProxy | null>(null);
  const [sendToast] = useToast();
  const storeUrl = useStoreUrl("checkout/upgrade/self-hosted");
  const storeOrigin = new URL(storeUrl).origin;
  const { updateToken, tokenStatus, error } = useLicense(() => {
    if (storeWindowRef.current) {
      sendToast({
        message: t`License activated successfully`,
        icon: "check_filled",
        timeout: NOTIFICATION_TIMEOUT,
      });
      sendMessageTokenActivation(true, storeWindowRef.current, storeOrigin);
    }
  });
  const currentUser = useSelector(getCurrentUser);
  const siteName = useSetting("site-name");

  const upsellLink = useUpsellLink({
    url: getStoreUrlWithParams({
      storeUrl,
      firstName: currentUser?.first_name ?? "",
      lastName: currentUser?.last_name ?? "",
      email: currentUser?.email ?? "",
      siteName,
    }),
    campaign,
    location,
  });

  function openStoresTab() {
    const storeWindow = window.open(upsellLink, "_blank");
    if (storeWindow) {
      storeWindowRef.current = storeWindow;
    }
  }

  useEffect(() => {
    const listener = createListener({
      updateToken,
      storeOrigin,
    });

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  }, [updateToken, storeOrigin]);

  useEffect(() => {
    if (error && storeWindowRef.current) {
      sendMessageTokenActivation(false, storeWindowRef.current, storeOrigin);
      sendToast({
        icon: "warning",
        message: error,
        timeout: NOTIFICATION_TIMEOUT,
      });
    }
  }, [tokenStatus, error, sendToast, storeOrigin]);

  return {
    triggerUpsellFlow: openStoresTab,
  };
}

function createListener({
  updateToken,
  storeOrigin,
}: {
  updateToken: (token: string) => Promise<void>;
  storeOrigin: string;
}) {
  return (event: MessageEvent<LicenseTokenMessage>) => {
    const token = handleMessageFromStore(event, storeOrigin);
    if (token) {
      updateToken(token);
    }
  };
}

interface LicenseTokenActivationMessage {
  source: "metabase-instance";
  type: "license-token-activated";
  payload: {
    success: boolean;
  };
}

interface LicenseTokenMessage {
  source: "metabase-store";
  type: "license-token-created";
  payload: {
    licenseToken: string;
  };
}

function handleMessageFromStore(
  event: MessageEvent<LicenseTokenMessage>,
  storeOrigin: string,
) {
  if (event.origin !== storeOrigin) {
    return;
  }

  if (event.data.source !== "metabase-store") {
    return;
  }

  if (event.data.type === "license-token-created") {
    return event.data.payload.licenseToken;
  }
}

function sendMessageTokenActivation(
  success: boolean,
  storeWindow: WindowProxy,
  storeOrigin: string,
) {
  storeWindow.postMessage(
    {
      source: "metabase-instance",
      type: "license-token-activated",
      payload: {
        success,
      },
    } satisfies LicenseTokenActivationMessage,
    storeOrigin,
  );
}

function getStoreUrlWithParams({
  storeUrl,
  firstName,
  lastName,
  email,
  siteName,
}: {
  storeUrl: string;
  firstName: string;
  lastName: string;
  email: string;
  siteName: string;
}) {
  const returnUrl = window.location.href;
  const returnUrlEncoded = encodeURIComponent(returnUrl);
  const siteNameEncoded = encodeURIComponent(siteName);
  const userDetails = `first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&email=${encodeURIComponent(email)}`;
  const storeUrlWithParams = `${storeUrl}?return_url=${returnUrlEncoded}&${userDetails}&company=${siteNameEncoded}`;

  return storeUrlWithParams;
}
