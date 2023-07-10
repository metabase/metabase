/**
 * Just because an instance is using an Enterprise artifact (jar or Docker image),
 * doesn't mean that the token is active or that it has all feature flags enabled.
 *
 * 1. `isEE` means enterprise instance without a token.
 * 2. `isPremium` means enterprise instance with all premium features enabled.
 */
export const isEE = Cypress.env("IS_ENTERPRISE");
export const isPremium = Cypress.env("HAS_PREMIUM_FEATURES");

export const isOSS = !isEE;

const conditionalDescribe = cond => (cond ? describe : describe.skip);

export const describeEE = conditionalDescribe(isEE);
export const describePremium = conditionalDescribe(isPremium);

export const describeOSS = conditionalDescribe(isOSS);
