import { useLocalStorage } from "@mantine/hooks";
import { useCallback } from "react";

// PROTOTYPE: the main-nav designs the variant picker flips between.
export const NAV_VARIANTS = [
  { id: "sections", label: "Sections" },
  { id: "tabs", label: "Tabs" },
  { id: "no-top-nav", label: "No top nav" },
  { id: "ask-ai", label: "Ask AI" },
] as const;

export type NavVariant = (typeof NAV_VARIANTS)[number]["id"];

const STORAGE_KEY = "prototype-nav-variant";
const URL_PARAM = "v";

function isNavVariant(value: unknown): value is NavVariant {
  return NAV_VARIANTS.some((variant) => variant.id === value);
}

// A `?v=N` link opens on variant N; it wins over the stored choice once, at load.
function applyVariantFromUrl() {
  const index = Number(
    new URLSearchParams(window.location.search).get(URL_PARAM),
  );
  const variant = NAV_VARIANTS[index - 1];
  if (variant) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(variant.id));
  }
}
applyVariantFromUrl();

/**
 * The main-nav variant being previewed. The choice is stored, so it survives
 * in-app navigation, and mirrored to `?v=N`, so a reload or shared link keeps it.
 */
export function useNavVariant() {
  const [storedVariant, setStoredVariant] = useLocalStorage<unknown>({
    key: STORAGE_KEY,
    defaultValue: NAV_VARIANTS[0].id,
    getInitialValueInEffect: false,
  });
  const variant = isNavVariant(storedVariant)
    ? storedVariant
    : NAV_VARIANTS[0].id;

  const setVariant = useCallback(
    (nextVariant: NavVariant) => {
      setStoredVariant(nextVariant);
      const url = new URL(window.location.href);
      const index = NAV_VARIANTS.findIndex(({ id }) => id === nextVariant);
      url.searchParams.set(URL_PARAM, String(index + 1));
      // Bypasses the router on purpose: the param is harness state, and a
      // router navigation would reload the page's data.
      window.history.replaceState(window.history.state, "", url);
    },
    [setStoredVariant],
  );

  return { variant, setVariant };
}
