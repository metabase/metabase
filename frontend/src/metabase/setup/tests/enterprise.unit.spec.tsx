import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupForTokenCheckEndpoint } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";

import { trackLicenseTokenStepSubmitted } from "../analytics";

import type { SetupOpts } from "./setup";
import {
  clickNextStep,
  expectSectionToHaveLabel,
  expectSectionsToHaveLabelsInOrder,
  getSection,
  selectUsageReason,
  setup,
  skipTokenStep,
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
    enterprisePlugins: "*", // we need the license and currently it's enabled at import time with setupEnterprisePlugins :/,
  });
};

const sampleToken = "a".repeat(64);
const airgapToken = "airgap_toucan";

describe("setup (EE build, but no token)", () => {
  it("default step order should be correct, with the license step and data usage steps", async () => {
    await setupEnterprise();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What should we call you?", "1");
    expectSectionToHaveLabel("What will you use Metabase for?", "2");
    expectSectionToHaveLabel("Add your data", "3");
    expectSectionToHaveLabel("Activate your commercial license", "4");
    expectSectionToHaveLabel("Usage data preferences", "5");

    expectSectionsToHaveLabelsInOrder();
  });

  describe("License activation step", () => {
    async function setupForLicenseStep() {
      await setupEnterprise();
      await skipWelcomeScreen();
      await submitUserInfoStep();
      await selectUsageReason("embedding"); // to skip the db connection step
      await clickNextStep();

      expect(
        await screen.findByText(
          "Unlock access to paid features if you'd like to try them out",
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

      await skipTokenStep("I'll activate later");

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
  await userEvent.click(await submitBtn());

  const settingEndpoint = "path:/api/setting/premium-embedding-token";
  await waitFor(() =>
    expect(fetchMock.callHistory.done(settingEndpoint)).toBe(true),
  );
  return fetchMock.callHistory.lastCall(settingEndpoint);
};
