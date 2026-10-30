import { createContext } from "react";

/**
 * `true` makes every AND implicit, as in "Without AND": never drawn, never
 * typed, the caret steps over it; only OR and parentheses are spelled out.
 */
export const ImplicitAndContext = createContext(false);
