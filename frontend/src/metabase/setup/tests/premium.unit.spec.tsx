/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import { screen } from "@testing-library/react";

import { createMockTokenFeatures } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import {
  clickNextStep,
  expectSectionsToHaveLabelsInOrder,
  expectSectionToHaveLabel,
  getLastSettingsPutPayload,
  selectUsageReason,
  setup,
  skipLanguageStep,
  skipWelcomeScreen,
  submitUserInfoStep,
} from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ hosting: true, embedding: true }),
  });
};

describe("setup (EE, hosting and embedding feature)", () => {
  it("default step order should be correct, without the commercial step", async () => {
    await setupPremium();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    expectSectionToHaveLabel("Usage data preferences", "5");

    expectSectionsToHaveLabelsInOrder();
  });

  it("should not render the license activation step", async () => {
    await setupPremium();
    await skipWelcomeScreen();
    expect(
      screen.queryByText("Activate your commercial license"),
    ).not.toBeInTheDocument();
  });

  it("should set 'setup-license-active-at-setup' to true", async () => {
    await setupPremium();
    await skipWelcomeScreen();
    await skipLanguageStep();
    await submitUserInfoStep();

    await selectUsageReason("embedding");
    await clickNextStep();

    screen.getByText("Finish").click();

    expect(await getLastSettingsPutPayload()).toEqual({
      "embedding-homepage": "visible",
      "enable-embedding": true,
      "setup-embedding-autoenabled": true,
      "setup-license-active-at-setup": true,
    });
  });
});
