import { useLocalStorage } from "@mantine/hooks";

import { useSetting } from "metabase/settings";

// PROTOTYPE: lets the prototype controls simulate git integration being off
// without touching the real setting.
const SIMULATED_ON_KEY = "prototype-git-integration-on";

/**
 * Whether the prototype's git-integration UI is on: a repository must really
 * be connected, and the prototype controls must not have simulated it off.
 */
export function useGitIntegrationEnabled() {
  const isConnected = useSetting("remote-sync-enabled") === true;
  const [isSimulatedOn, setIsSimulatedOn] = useLocalStorage({
    key: SIMULATED_ON_KEY,
    defaultValue: true,
    getInitialValueInEffect: false,
  });

  return {
    isEnabled: isConnected && isSimulatedOn,
    isConnected,
    setIsSimulatedOn,
  };
}
