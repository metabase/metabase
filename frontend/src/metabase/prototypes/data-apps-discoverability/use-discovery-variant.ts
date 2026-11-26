import { useLocalStorage } from "@mantine/hooks";
import { useCallback } from "react";

import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";

// PROTOTYPE: the data apps entry points the variant picker flips between.
export const DISCOVERY_VARIANTS = [
  { id: "side-nav", label: "Side nav" },
  { id: "new-menu", label: "New menu" },
  { id: "both", label: "Both" },
] as const;

export type DiscoveryVariant = (typeof DISCOVERY_VARIANTS)[number]["id"];

export const DATA_APPS_GUIDE_URL = "/data-apps";

const VARIANT_STORAGE_KEY = "prototype-data-apps-discovery-variant";
const URL_PARAM = "v";
const DEFAULT_VARIANT: DiscoveryVariant = "side-nav";

function isDiscoveryVariant(value: unknown): value is DiscoveryVariant {
  return DISCOVERY_VARIANTS.some((variant) => variant.id === value);
}

// A `?v=N` link opens the app on variant N. Without it, the last picked variant holds.
function applyVariantAtLoad() {
  const index = Number(
    new URLSearchParams(window.location.search).get(URL_PARAM),
  );
  const variant = DISCOVERY_VARIANTS[index - 1]?.id;
  if (variant) {
    window.localStorage.setItem(VARIANT_STORAGE_KEY, JSON.stringify(variant));
  }
}
applyVariantAtLoad();

/**
 * The data apps entry point being previewed. The choice is stored, so it survives navigation and reloads, and
 * mirrored to `?v=N`, so the URL can be shared.
 */
export function useDiscoveryVariant() {
  const [storedVariant, setStoredVariant] = useLocalStorage<unknown>({
    key: VARIANT_STORAGE_KEY,
    defaultValue: DEFAULT_VARIANT,
    getInitialValueInEffect: false,
  });
  const variant = isDiscoveryVariant(storedVariant)
    ? storedVariant
    : DEFAULT_VARIANT;

  const setVariant = useCallback(
    (nextVariant: DiscoveryVariant) => {
      setStoredVariant(nextVariant);
      const url = new URL(window.location.href);
      const index = DISCOVERY_VARIANTS.findIndex(
        ({ id }) => id === nextVariant,
      );
      url.searchParams.set(URL_PARAM, String(index + 1));
      // Bypasses the router on purpose: the param is harness state, and a router navigation would reload the page.
      window.history.replaceState(window.history.state, "", url);
    },
    [setStoredVariant],
  );

  return { variant, setVariant };
}

// PROTOTYPE: the layouts of the `/data-apps` guide page the variant picker flips between.
export const GUIDE_LAYOUTS = [
  { id: "simple", label: "Simple" },
  { id: "cards", label: "Cards" },
  { id: "accordion", label: "Accordion" },
  { id: "numbered", label: "Numbered" },
] as const;

export type GuideLayout = (typeof GUIDE_LAYOUTS)[number]["id"];

const LAYOUT_STORAGE_KEY = "prototype-data-apps-guide-layout";
const DEFAULT_LAYOUT: GuideLayout = "simple";

/** The guide page layout being previewed. The choice is stored, so it survives navigation and reloads. */
export function useGuideLayout() {
  const [storedLayout, setLayout] = useLocalStorage<GuideLayout>({
    key: LAYOUT_STORAGE_KEY,
    defaultValue: DEFAULT_LAYOUT,
    getInitialValueInEffect: false,
  });
  const layout = GUIDE_LAYOUTS.some(({ id }) => id === storedLayout)
    ? storedLayout
    : DEFAULT_LAYOUT;

  return { layout, setLayout };
}

// PROTOTYPE: how many data apps the side nav pretends the instance has.
export const DATA_APP_SIMULATIONS = [
  { id: "real", label: "Real" },
  { id: "none", label: "0 apps" },
  { id: "five", label: "5 apps" },
] as const;

export type DataAppSimulation = (typeof DATA_APP_SIMULATIONS)[number]["id"];

const SIMULATION_STORAGE_KEY = "prototype-data-apps-simulation";
const DEFAULT_SIMULATION: DataAppSimulation = "real";

/** The simulated number of data apps. "real" uses the instance's own data apps. */
export function useSimulatedDataApps() {
  const [storedSimulation, setSimulation] = useLocalStorage<DataAppSimulation>(
    {
      key: SIMULATION_STORAGE_KEY,
      defaultValue: DEFAULT_SIMULATION,
      getInitialValueInEffect: false,
    },
  );
  const simulation = DATA_APP_SIMULATIONS.some(
    ({ id }) => id === storedSimulation,
  )
    ? storedSimulation
    : DEFAULT_SIMULATION;

  return { simulation, setSimulation };
}

// PROTOTYPE: who the prototype pretends is signed in.
export const USER_ROLE_SIMULATIONS = [
  { id: "admin", label: "Admin" },
  { id: "regular", label: "Regular user" },
] as const;

export type UserRoleSimulation = (typeof USER_ROLE_SIMULATIONS)[number]["id"];

const ROLE_STORAGE_KEY = "prototype-data-apps-user-role";
const DEFAULT_ROLE: UserRoleSimulation = "admin";

/** The simulated role of the current user. */
export function useSimulatedUserRole() {
  const [storedRole, setRole] = useLocalStorage<UserRoleSimulation>({
    key: ROLE_STORAGE_KEY,
    defaultValue: DEFAULT_ROLE,
    getInitialValueInEffect: false,
  });
  const role = USER_ROLE_SIMULATIONS.some(({ id }) => id === storedRole)
    ? storedRole
    : DEFAULT_ROLE;

  return { role, setRole };
}

/**
 * Whether the prototype should treat the current user as an admin. The simulation can only take admin away: a
 * regular user stays one whatever the picker says.
 */
export function useSimulatedIsAdmin() {
  const isAdmin = useSelector(getUserIsAdmin);
  const { role } = useSimulatedUserRole();

  return isAdmin && role === "admin";
}
