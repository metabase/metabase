import { createContext } from "react";

/** Context for the locale used in the SDK and public/static embeds from the #locale parameter. */
export const FrontendLocaleContext = createContext<{
  locale: string | null;
  isLocaleLoading: boolean;
}>({
  locale: null,
  isLocaleLoading: false,
});
