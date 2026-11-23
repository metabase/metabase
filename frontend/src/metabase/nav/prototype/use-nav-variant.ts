import { useLocalStorage } from "@mantine/hooks";
import { useCallback } from "react";

// PROTOTYPE: the main-nav designs the variant picker flips between.
export const NAV_VARIANTS = [
  { id: "sections", label: "Sections" },
  { id: "tabs", label: "Tabs" },
  { id: "no-top-nav", label: "Modern nav - A" },
  { id: "modern-nav-b", label: "Modern nav - B" },
  { id: "modern-nav-c", label: "Modern nav - C" },
  { id: "modern-nav-d", label: "Modern nav - D" },
] as const;

export type NavVariant = (typeof NAV_VARIANTS)[number]["id"];

/**
 * The "Modern nav" variants: no top bar, the nav's own header, and vertical
 * tabs. They differ only in how the tabs are named, ordered and grouped.
 */
export function isModernNav(variant: NavVariant): boolean {
  return (
    variant === "no-top-nav" ||
    variant === "modern-nav-b" ||
    variant === "modern-nav-c" ||
    variant === "modern-nav-d"
  );
}

const STORAGE_KEY = "prototype-nav-variant";
const URL_PARAM = "v";

// What the app opens on, unless a `?v=N` link says otherwise.
const DEFAULT_VARIANT: NavVariant = "modern-nav-c";

function isNavVariant(value: unknown): value is NavVariant {
  return NAV_VARIANTS.some((variant) => variant.id === value);
}

// Each app load starts on the default variant, or on variant N for a `?v=N`
// link. Flipping in the picker then holds for the rest of the session.
function applyVariantAtLoad() {
  const index = Number(
    new URLSearchParams(window.location.search).get(URL_PARAM),
  );
  const variant = NAV_VARIANTS[index - 1]?.id ?? DEFAULT_VARIANT;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(variant));
}
applyVariantAtLoad();

/**
 * The main-nav variant being previewed. The choice is stored, so it survives
 * in-app navigation, and mirrored to `?v=N`, so a reload keeps it while the
 * URL still has it.
 */
export function useNavVariant() {
  const [storedVariant, setStoredVariant] = useLocalStorage<unknown>({
    key: STORAGE_KEY,
    defaultValue: DEFAULT_VARIANT,
    getInitialValueInEffect: false,
  });
  const variant = isNavVariant(storedVariant) ? storedVariant : DEFAULT_VARIANT;

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
