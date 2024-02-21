/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import type { SetupOpts } from "./setup";
import {
  expectSectionsToHaveLabelsInOrder,
  expectSectionToHaveLabel,
  setup,
  skipWelcomeScreen,
} from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("setup (E, no token)", () => {
  it("default step order should be correct, with the commercial step in place", async () => {
    await setupEnterprise();
    skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    expectSectionToHaveLabel("Activate your commercial license", "5");
    expectSectionToHaveLabel("Usage data preferences", "6");

    expectSectionsToHaveLabelsInOrder();
  });
});
