export const isEE = Cypress.env("HAS_ENTERPRISE_TOKEN");
export const isOSS = !isEE;

export const describeEE = isEE ? describe : describe.skip;

export const describeOSS = isOSS ? describe : describe.skip;
