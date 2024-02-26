/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForTokenCheckEndpoint } from "__support__/server-mocks";

import { trackLicenseTokenStepSubmitted } from "../analytics";

import type { SetupOpts } from "./setup";
import {
  clickNextStep,
  expectSectionsToHaveLabelsInOrder,
  expectSectionToHaveLabel,
  getSection,
  selectUsageReason,
  setup,
  skipLanguageStep,
  skipWelcomeScreen,
  submitUserInfoStep,
} from "./setup";

jest.mock("../analytics", () => ({
  ...jest.requireActual("../analytics"),
  trackLicenseTokenStepSubmitted: jest.fn(),
}));

const setupEnterprise = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

const sampleToken = "a".repeat(64);

describe("setup (EE, no token)", () => {
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

  describe("License activation step", () => {
    async function setupForLicenseStep() {
      await setupEnterprise();
      skipWelcomeScreen();
      skipLanguageStep();
      await submitUserInfoStep();
      selectUsageReason("embedding"); // to skip the db connection step
      clickNextStep();

      expect(
        await screen.findByText(
          "Unlock access to your paid features before starting",
        ),
      ).toBeInTheDocument();
    }

    it("should display an error in case of invalid token", async () => {
      await setupForLicenseStep();

      setupForTokenCheckEndpoint({ valid: false });

      userEvent.paste(
        screen.getByRole("textbox", { name: "Token" }),
        sampleToken,
      );

      screen.getByRole("button", { name: "Activate" }).click();

      expect(
        await screen.findByText(
          "This token doesn’t seem to be valid. Double-check it, then contact support if you think it should be working",
        ),
      ).toBeInTheDocument();
    });

    it("should go to the next step when activating a valid token", async () => {
      await setupForLicenseStep();

      setupForTokenCheckEndpoint({ valid: true });

      userEvent.paste(
        screen.getByRole("textbox", { name: "Token" }),
        sampleToken,
      );

      screen.getByRole("button", { name: "Activate" }).click();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Activate" }),
        ).not.toHaveProperty("data-loading", true);
      });

      expect(trackLicenseTokenStepSubmitted).toHaveBeenCalledWith(true);

      expect(getSection("Usage data preferences")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    it("should be possible to skip the step without a token", async () => {
      await setupForLicenseStep();

      clickNextStep();

      expect(trackLicenseTokenStepSubmitted).toHaveBeenCalledWith(false);

      expect(getSection("Usage data preferences")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    it("should pass the token to the setup endpoint", async () => {
      await setupForLicenseStep();

      setupForTokenCheckEndpoint({ valid: true });

      userEvent.paste(
        screen.getByRole("textbox", { name: "Token" }),
        sampleToken,
      );

      screen.getByRole("button", { name: "Activate" }).click();

      (await screen.findByRole("button", { name: "Finish" })).click();

      const setupCall = fetchMock.lastCall(`path:/api/setup`);
      expect(await setupCall?.request?.json()).toMatchObject({
        license_token: sampleToken,
      });
    });
  });
});
