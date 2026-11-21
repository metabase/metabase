import { useLocalStorage } from "@mantine/hooks";

import { useSetting } from "metabase/settings";

// PROTOTYPE: lets the prototype controls simulate the Tenants feature in the
// main nav without touching the real setting.
const SIMULATED_ON_KEY = "prototype-tenants-on";

/**
 * Whether the main nav shows the Tenants UI (External collections). Off until
 * turned on in the prototype controls. `isReal` says whether the instance
 * really has tenants on; when it doesn't, the nav shows mocked collections.
 */
export function useTenantsEnabled() {
  const isReal = useSetting("use-tenants") === true;
  const [isSimulatedOn, setIsSimulatedOn] = useLocalStorage({
    key: SIMULATED_ON_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  });

  return { isEnabled: isSimulatedOn, isReal, setIsSimulatedOn };
}
