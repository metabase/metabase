import type {
  ConditionalDerivation,
  Derivation,
  DerivationRule,
  GeneratedColorStops,
} from "../types/lightness-stops";

import {
  getAccessibleBackgroundStep,
  getAccessibleTextStep,
  getRelativeStep,
} from "./lightness-stops";

/**
 * Resolves a single derivation rule to a color string.
 */
export function resolveDerivation(
  derivation: Derivation,
  stops: GeneratedColorStops,
): string {
  // Fixed step
  if (typeof derivation === "number") {
    return stops.solid[derivation];
  }

  // Relative offset
  if ("offset" in derivation) {
    const step = getRelativeStep(stops.detectedStep, derivation.offset);
    return stops.solid[step];
  }

  // Accessor functions
  if ("accessor" in derivation) {
    if (derivation.accessor === "accessibleText") {
      const step = getAccessibleTextStep(stops);
      if ("offsetFromResult" in derivation) {
        return stops.solid[getRelativeStep(step, derivation.offsetFromResult)];
      }
      return stops.solid[step];
    }
    if (derivation.accessor === "accessibleBackground") {
      const step = getAccessibleBackgroundStep(stops);
      return stops.solid[step];
    }
  }

  // Alpha derivations
  if ("alpha" in derivation) {
    const step = derivation.alpha;
    return stops.alpha[step] ?? stops.solid[step];
  }

  if ("alphaInverse" in derivation) {
    const step = derivation.alphaInverse;
    return stops.alphaInverse[step] ?? stops.solid[step];
  }

  throw new Error(`Unknown derivation: ${JSON.stringify(derivation)}`);
}

/**
 * Resolves a conditional derivation rule based on theme and brand lightness.
 */
export function resolveConditionalDerivation(
  rule: DerivationRule,
  stops: GeneratedColorStops,
  isDarkTheme: boolean,
  brandIsDark: boolean,
): string | undefined {
  // Simple derivation
  if (
    typeof rule === "number" ||
    "offset" in rule ||
    "accessor" in rule ||
    "alpha" in rule ||
    "alphaInverse" in rule
  ) {
    return resolveDerivation(rule as Derivation, stops);
  }

  // Conditional derivation
  const conditional = rule as ConditionalDerivation;
  const themeRules = isDarkTheme
    ? conditional.darkTheme
    : conditional.lightTheme;

  if (themeRules) {
    // Check brand-specific rules first
    if (brandIsDark && themeRules.darkBrand) {
      return resolveDerivation(themeRules.darkBrand, stops);
    }
    if (!brandIsDark && themeRules.lightBrand) {
      return resolveDerivation(themeRules.lightBrand, stops);
    }
    // Fall back to default for this theme
    if (themeRules.default) {
      return resolveDerivation(themeRules.default, stops);
    }
  }

  // Fall back to global default
  if (conditional.default) {
    return resolveDerivation(conditional.default, stops);
  }

  return undefined;
}
