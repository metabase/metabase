/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    tokenFeatures: createMockTokenFeatures({ embedding: true }),
  });
};

describe("setup (EE build, `embedding` feature but no `hosting` to simulate pro self-hosted)", () => {
  it("default step order should be correct, without the commercial step but with the data usage step", async () => {
    await setupPremium();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    // no "Activate your commercial license" as this has token-features
    expectSectionToHaveLabel("Usage data preferences", "5");

    expectSectionsToHaveLabelsInOrder();
  });

  it("should show the analytics opt out", async () => {
    await setupPremium();
    await skipWelcomeScreen();

    expect(screen.getByText("Usage data preferences")).toBeInTheDocument();
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

    await userEvent.click(screen.getByText("Finish"));

    expect(await screen.findByText("Take me to Metabase")).toBeInTheDocument();

    expect(await getLastSettingsPutPayload()).toEqual({
      "embedding-homepage": "visible",
      "enable-embedding": true,
      "setup-embedding-autoenabled": true,
      "setup-license-active-at-setup": true,
    });
  });
});
