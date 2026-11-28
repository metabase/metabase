import { useLocalStorage } from "@mantine/hooks";
import { useCallback, useEffect } from "react";

import { useSetting } from "metabase/settings";

// PROTOTYPE: lets the prototype controls simulate git integration being off
// without touching the real setting.
const SIMULATED_ON_KEY = "prototype-git-integration-on";
// Whether a repository was connected the last time the app knew. Plugins
// start before the user's settings load, so they go by this.
const CONNECTED_KEY = "prototype-git-integration-connected";

function readIsSimulatedOn(): boolean {
  // Stored as JSON by `useLocalStorage`; on unless explicitly turned off.
  return window.localStorage.getItem(SIMULATED_ON_KEY) !== "false";
}

function readIsConnected(): boolean {
  return window.localStorage.getItem(CONNECTED_KEY) === "true";
}

/**
 * Whether git integration counts as on, outside React (e.g. while plugins
 * initialize, before the user's settings load). Uses the last known
 * connection state; `useSyncGitIntegrationAtStartup` keeps it current.
 */
export function getIsGitIntegrationEnabled(): boolean {
  return readIsConnected() && readIsSimulatedOn();
}

// What the app started with, so a change can trigger a reload.
const isEnabledAtStartup = getIsGitIntegrationEnabled();

/**
 * Keeps the startup decision in line with the real connection state. When a
 * repository is connected or disconnected after the app started, the cached
 * state is updated and the app reloads so plugins pick it up.
 */
export function useSyncGitIntegrationAtStartup() {
  const connectedSetting = useSetting("remote-sync-enabled");

  useEffect(() => {
    // Not loaded yet; wait for the real value.
    if (typeof connectedSetting !== "boolean") {
      return;
    }
    window.localStorage.setItem(CONNECTED_KEY, String(connectedSetting));
    if (getIsGitIntegrationEnabled() !== isEnabledAtStartup) {
      window.location.reload();
    }
  }, [connectedSetting]);
}

/**
 * Whether the prototype's git-integration UI is on: a repository must really
 * be connected, and the prototype controls must not have simulated it off.
 */
export function useGitIntegrationEnabled() {
  const isConnected = useSetting("remote-sync-enabled") === true;
  const [isSimulatedOn, setStoredIsSimulatedOn] = useLocalStorage({
    key: SIMULATED_ON_KEY,
    defaultValue: true,
    getInitialValueInEffect: false,
  });

  // Git integration also hides Official collections and Verification, which
  // are decided once, when plugins initialize — so switching reloads the app.
  const setIsSimulatedOn = useCallback(
    (isOn: boolean) => {
      setStoredIsSimulatedOn(isOn);
      window.localStorage.setItem(SIMULATED_ON_KEY, JSON.stringify(isOn));
      window.location.reload();
    },
    [setStoredIsSimulatedOn],
  );

  return {
    isEnabled: isConnected && isSimulatedOn,
    isConnected,
    setIsSimulatedOn,
  };
}
