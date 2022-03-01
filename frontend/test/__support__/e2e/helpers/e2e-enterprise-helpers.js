export const isEE = Cypress.env("HAS_ENTERPRISE_TOKEN");
export const isOSS = !isEE;

export const describeWithToken = isEE ? describe : describe.skip;

export const describeWithoutToken = isOSS ? describe : describe.skip;
