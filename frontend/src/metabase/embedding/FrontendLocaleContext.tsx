import { type Context, createContext } from "react";

/**
 * Context for the locale used in the SDK and in public/static embeds (from the
 * `#locale` parameter). Kept in its own module — separate from `LocaleProvider`
 * — so lightweight consumers (e.g. `PublicComponentStylesWrapper`) can read the
 * locale without pulling in the provider's data-fetching dependencies.
 */
export const FrontendLocaleContext = createContext({}) as unknown as Context<{
  locale: string | null;
  isLocaleLoading: boolean;
}>;
