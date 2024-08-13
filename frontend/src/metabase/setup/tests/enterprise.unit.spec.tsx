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
const airgapToken = "airgap_toucan";

describe("setup (EE, no token)", () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it("default step order should be correct, with the commercial step in place", async () => {
    await setupEnterprise();
    await skipWelcomeScreen();
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
      await skipWelcomeScreen();
      await skipLanguageStep();
      await submitUserInfoStep();
      await selectUsageReason("embedding"); // to skip the db connection step
      await clickNextStep();

      expect(
        await screen.findByText(
          "Unlock access to your paid features before starting",
        ),
      ).toBeInTheDocument();
    }

    it("should display an error in case of invalid token", async () => {
      await setupForLicenseStep();
      setupForTokenCheckEndpoint({ valid: false });

      await inputToken(sampleToken);
      await submit();

      expect(await errMsg()).toBeInTheDocument();
    });

    it("should have the Activate button disabled when the token is not 64 characters long (unless the token begins with 'airgap_')", async () => {
      await setupForLicenseStep();

      await inputToken("a".repeat(63));
      expect(await submitBtn()).toBeDisabled();

      await userEvent.type(input(), "a"); //64 characters
      expect(await submitBtn()).toBeEnabled();

      await userEvent.type(input(), "a"); //65 characters
      expect(await submitBtn()).toBeDisabled();

      await userEvent.clear(input());
      await userEvent.type(input(), "airgap_");
      expect(await submitBtn()).toBeEnabled();
    });

    it("should ignore whitespace around the token", async () => {
      await setupForLicenseStep();
      setupForTokenCheckEndpoint({ valid: true });

      await inputToken(`    ${sampleToken}   `);
      expect(input()).toHaveValue(sampleToken);
      expect(await submitBtn()).toBeEnabled();
      const submitCall = await submit();

      expect(await submitCall?.request?.json()).toEqual({
        value: sampleToken,
      });
    });

    it("should go to the next step when activating a typical, valid token", async () => {
      await setupForLicenseStep();

      setupForTokenCheckEndpoint({ valid: true });

      await inputToken(sampleToken);
      await submit();

      expect(trackLicenseTokenStepSubmitted).toHaveBeenCalledWith(true);

      expect(getSection("Usage data preferences")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    it("should go to the next step when activating an airgap-specific token", async () => {
      await setupForLicenseStep();

      setupForTokenCheckEndpoint({ valid: true });

      await inputToken(airgapToken);
      await submit();

      expect(trackLicenseTokenStepSubmitted).toHaveBeenCalledWith(true);

      expect(getSection("Usage data preferences")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    it("should be possible to skip the step without a token", async () => {
      await setupForLicenseStep();

      await clickOnSkip();

      expect(trackLicenseTokenStepSubmitted).toHaveBeenCalledWith(false);

      expect(getSection("Usage data preferences")).toHaveAttribute(
        "aria-current",
        "step",
      );
    });

    it("should pass the token to the settings endpoint", async () => {
      await setupForLicenseStep();
      setupForTokenCheckEndpoint({ valid: true });

      await inputToken(sampleToken);
      const submitCall = await submit();

      expect(await submitCall?.request?.json()).toEqual({
        value: sampleToken,
      });
    });
  });
});

const input = () => screen.getByRole("textbox", { name: "Token" });

const inputToken = async (token: string) =>
  await userEvent.type(input(), token);

const errMsg = () => screen.findByText(/This token doesn’t seem to be valid/);

const submitBtn = () => screen.findByRole("button", { name: "Activate" });

const submit = async () => {
  (await submitBtn()).click();

  const settingEndpoint = "path:/api/setting/premium-embedding-token";
  await waitFor(() => expect(fetchMock.done(settingEndpoint)).toBe(true));
  return fetchMock.lastCall(settingEndpoint);
};

const clickOnSkip = async () =>
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
