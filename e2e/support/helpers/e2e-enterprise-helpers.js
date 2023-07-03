export const isEE = Cypress.env("HAS_ENTERPRISE_TOKEN");
export const isOSS = !isEE;

const conditionalDescribe = cond => (cond ? describe : describe.skip);

export const describeEE = conditionalDescribe(isEE);

export const describeOSS = conditionalDescribe(isOSS);
