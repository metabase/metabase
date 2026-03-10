import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockSettingDefinition } from "metabase-types/api/mocks";

import { SUBSCRIBE_TOKEN, SUBSCRIBE_URL } from "../constants";

import {
  clickNextStep,
  expectSectionToHaveLabel,
  expectSectionsToHaveLabelsInOrder,
  getLastSettingsPutPayload,
  getSection,
  selectUsageReason,
  setup,
  skipWelcomeScreen,
  submitUserInfoStep,
} from "./setup";

describe("setup (OSS)", () => {
  it("default step order should be correct", async () => {
    await setup();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What should we call you?", "1");
    expectSectionToHaveLabel("What will you use Metabase for?", "2");
    expectSectionToHaveLabel("Add your data", "3");
    expectSectionToHaveLabel("Usage data preferences", "4");

    expectSectionsToHaveLabelsInOrder();
  });

  it("should keep steps in order through the whole setup", async () => {
    await setup();
    await skipWelcomeScreen();
    expectSectionsToHaveLabelsInOrder({ from: 0 });

    await submitUserInfoStep();
    expectSectionsToHaveLabelsInOrder({ from: 1 });

    await clickNextStep(); // Usage question
    expectSectionsToHaveLabelsInOrder({ from: 2 });

    await userEvent.click(screen.getByText("Continue with sample data"));
    expectSectionsToHaveLabelsInOrder({ from: 3 });
  });

  describe("Usage question", () => {
    async function setupForUsageQuestion() {
      await setup();
      await skipWelcomeScreen();
      await submitUserInfoStep();
    }

    describe("when selecting 'Self service'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("self-service-analytics");
        await clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "3");
        expectSectionToHaveLabel("Usage data preferences", "4");
      });
    });

    describe("when selecting 'Embedding'", () => {
      it("should hide the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("embedding");
        await clickNextStep();

        expect(screen.queryByText("Add your data")).not.toBeInTheDocument();

        expect(getSection("Usage data preferences")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Usage data preferences", "3");
      });
    });

    describe("when selecting 'A bit of both'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("both");
        await clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "3");
        expectSectionToHaveLabel("Usage data preferences", "4");
      });
    });

    describe("when selecting 'Not sure yet'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("not-sure");
        await clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "3");
        expectSectionToHaveLabel("Usage data preferences", "4");
      });
    });
  });

  describe("embedding homepage flags", () => {
    it("should set the correct flags when interested in embedding", async () => {
      await setup();
      await skipWelcomeScreen();
      await submitUserInfoStep();

      await selectUsageReason("embedding");
      await clickNextStep();

      await userEvent.click(screen.getByText("Finish"));

      expect(await getLastSettingsPutPayload()).toEqual({
        "embedding-homepage": "visible",
        "setup-license-active-at-setup": false,
      });
    });

    it("should not set 'embedding-homepage' when not interested in embedding", async () => {
      await setup();
      await skipWelcomeScreen();
      await submitUserInfoStep();

      await selectUsageReason("self-service-analytics");
      await clickNextStep();

      await userEvent.click(screen.getByText("Continue with sample data"));

      await userEvent.click(screen.getByText("Finish"));

      const flags = await getLastSettingsPutPayload();

      expect(flags["embedding-homepage"]).toBeUndefined();
      expect(flags["enable-embedding"]).toBeUndefined();
      expect(flags["setup-embedding-autoenabled"]).toBeUndefined();
    });

    it("should not autoenable embedding if it was set by an env", async () => {
      await setup({
        settingOverrides: [
          createMockSettingDefinition({
            key: "enable-embedding",
            value: false,
            is_env_setting: true,
          }),
        ],
      });
      await skipWelcomeScreen();
      await submitUserInfoStep();

      await selectUsageReason("embedding");
      await clickNextStep();

      await userEvent.click(screen.getByText("Finish"));

      const flags = await getLastSettingsPutPayload();

      expect(flags).toEqual({
        "embedding-homepage": "visible",
        "setup-license-active-at-setup": false,
      });
    });
  });

  describe("newsletter step", () => {
    let originalSendBeacon: typeof window.navigator.sendBeacon;

    beforeEach(() => {
      originalSendBeacon = window.navigator.sendBeacon;
      window.navigator.sendBeacon = jest.fn();
    });

    afterEach(() => {
      window.navigator.sendBeacon = originalSendBeacon;
      jest.clearAllMocks();
    });

    it("should call navigator.sendBeacon if the user checked the box", async () => {
      await setup();
      await skipWelcomeScreen();
      await submitUserInfoStep();
      await selectUsageReason("self-service-analytics");
      await clickNextStep();
      await userEvent.click(screen.getByText("Continue with sample data"));
      await userEvent.click(screen.getByText("Finish"));

      await userEvent.click(
        screen.getByText(
          "Get infrequent emails about new releases and feature updates.",
        ),
      );

      await userEvent.click(screen.getByText("Take me to Metabase"));

      const formData = new FormData();
      formData.append("EMAIL", "john@example.org"); // email from user step
      formData.append(SUBSCRIBE_TOKEN, "");

      expect(window.navigator.sendBeacon).toHaveBeenCalledWith(
        SUBSCRIBE_URL,
        formData,
      );
    });

    it("should *NOT* call navigator.sendBeacon if the user has not checked the box", async () => {
      await setup();
      await skipWelcomeScreen();
      await submitUserInfoStep();
      await selectUsageReason("self-service-analytics");
      await clickNextStep();
      await userEvent.click(screen.getByText("Continue with sample data"));

      await userEvent.click(screen.getByText("Finish"));

      await userEvent.click(screen.getByText("Take me to Metabase"));

      expect(window.navigator.sendBeacon).not.toHaveBeenCalled();
    });
  });
});
