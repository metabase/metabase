import { type Context, createContext } from "react";

/** context for the locale used in the sdk and in public/static from the #locale parameter  */
export const FrontendLocaleContext = createContext({}) as unknown as Context<{
  locale: string | null;
  isLocaleLoading: boolean;
}>;
