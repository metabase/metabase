import JSDOMEnvironment from "jest-environment-jsdom";
import cloneDeep from "lodash.clonedeep";

// https://github.com/facebook/jest/blob/v29.4.3/website/versioned_docs/version-29.4/Configuration.md#testenvironment-string
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);
    // https://github.com/jsdom/jsdom/issues/3363
    this.global.structuredClone = cloneDeep;
  }
}
