/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import { screen } from "@testing-library/react";

import { createMockTokenFeatures } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import {
  clickNextStep,
  expectSectionToHaveLabel,
  expectSectionsToHaveLabelsInOrder,
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

describe("setup (EE build, `hosting` and `embedding` features to simulate pro on cloud)", () => {
  it("default step order should be correct, without the license and data usage steps", async () => {
    await setupPremium();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    // no "Activate your commercial license" as this has token-features
    // no "Usage data preferences" as this is a hosted instance

    expectSectionsToHaveLabelsInOrder();
  });

  it("should not show the analytics opt out (because of token-feature 'hosting')", async () => {
    await setupPremium();
    await skipWelcomeScreen();

    expect(
      screen.queryByText("Usage data preferences"),
    ).not.toBeInTheDocument();
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

    expect(await screen.findByText("Take me to Metabase")).toBeInTheDocument();

    expect(await getLastSettingsPutPayload()).toEqual({
      "embedding-homepage": "visible",
      "setup-license-active-at-setup": true,
    });
  });
});
