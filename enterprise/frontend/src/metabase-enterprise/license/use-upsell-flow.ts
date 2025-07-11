import { useEffect, useRef } from "react";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { useSetting, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getStoreUrl } from "metabase/selectors/settings";
import { useLicense } from "metabase-enterprise/settings/hooks/use-license";

// Get store URL from query parameter or default to getStoreUrl
const getStoreUrlFromParams = () => {
  const params = new URLSearchParams(window.location.search);
  const storeUrlParam = params.get("store_url");

  if (storeUrlParam) {
    return `${storeUrlParam}/checkout/upgrade/self-hosted`;
  }

  return getStoreUrl("checkout/upgrade/self-hosted");
};

const STORE_URL = getStoreUrlFromParams();
const STORE_ORIGIN = new URL(STORE_URL).origin;

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
  const { updateToken, tokenStatus, error } = useLicense(() => {
    if (storeWindowRef.current) {
      sendToast({
        message: t`License activated successfully`,
        icon: "check_filled",
      });
      sendMessageTokenActivation(true, storeWindowRef.current);
    }
  });
  const currentUser = useSelector(getCurrentUser);
  const siteName = useSetting("site-name");

  const upsellLink = useUpsellLink({
    url: getStoreUrlWithParams({
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
    const { name } = window;
    if (name !== "metabase-instance") {
      window.name = "metabase-instance";
    }

    const listener = createListener({
      updateToken,
    });

    window.addEventListener("message", listener);

    return () => {
      window.name = name;
      window.removeEventListener("message", listener);
    };
  }, [updateToken]);

  useEffect(() => {
    if (error && storeWindowRef.current) {
      sendMessageTokenActivation(false, storeWindowRef.current);
      sendToast({
        message: error,
      });
    }
  }, [tokenStatus, error, sendToast]);

  return {
    triggerUpsellFlow: openStoresTab,
  };
}

function createListener({
  updateToken,
}: {
  updateToken: (token: string) => Promise<void>;
}) {
  return (event: MessageEvent<LicenseTokenMessage>) => {
    const token = handleMessageFromStore(event);
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

function handleMessageFromStore(event: MessageEvent<LicenseTokenMessage>) {
  if (event.origin !== STORE_ORIGIN) {
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
) {
  storeWindow.postMessage(
    {
      source: "metabase-instance",
      type: "license-token-activated",
      payload: {
        success,
      },
    } satisfies LicenseTokenActivationMessage,
    STORE_ORIGIN,
  );
}

function getStoreUrlWithParams({
  firstName,
  lastName,
  email,
  siteName,
}: {
  firstName: string;
  lastName: string;
  email: string;
  siteName: string;
}) {
  const storeUrl = STORE_URL;
  const returnUrl = window.location.href;
  const returnUrlEncoded = encodeURIComponent(returnUrl);
  const siteNameEncoded = encodeURIComponent(siteName);
  const userDetails = `first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&email=${encodeURIComponent(email)}`;
  const storeUrlWithParams = `${storeUrl}?return_url=${returnUrlEncoded}&${userDetails}&company=${siteNameEncoded}`;

  return storeUrlWithParams;
}
