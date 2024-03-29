/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { createMockSettingDefinition } from "metabase-types/api/mocks";

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
  getLastSettingsPutPayload,
  MOCK_RANDOM_TOKEN,
} from "./setup";

describe("setup (OSS)", () => {
  it("default step order should be correct", async () => {
    await setup();
    skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    expectSectionToHaveLabel("Usage data preferences", "5");

    expectSectionsToHaveLabelsInOrder();
  });

  it("should keep steps in order through the whole setup", async () => {
    await setup();
    skipWelcomeScreen();
    expectSectionsToHaveLabelsInOrder({ from: 0 });

    skipLanguageStep();
    expectSectionsToHaveLabelsInOrder({ from: 1 });

    await submitUserInfoStep();
    expectSectionsToHaveLabelsInOrder({ from: 2 });

    clickNextStep(); // Usage question
    expectSectionsToHaveLabelsInOrder({ from: 3 });

    userEvent.click(screen.getByText("I'll add my data later"));
    expectSectionsToHaveLabelsInOrder({ from: 4 });
  });

  describe("Usage question", () => {
    async function setupForUsageQuestion() {
      await setup();
      skipWelcomeScreen();
      skipLanguageStep();
      await submitUserInfoStep();
    }

    describe("when selecting 'Self service'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("self-service-analytics");
        clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });
    });

    describe("when selecting 'Embedding'", () => {
      it("should hide the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("embedding");
        clickNextStep();

        expect(screen.queryByText("Add your data")).not.toBeInTheDocument();

        expect(getSection("Usage data preferences")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Usage data preferences", "4");
      });
    });

    describe("when selecting 'A bit of both'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("both");
        clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });
    });

    describe("when selecting 'Not sure yet'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("not-sure");
        clickNextStep();

        expect(screen.getByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });
    });
  });

  describe("embedding homepage flags", () => {
    it("should set the correct flags when interested in embedding", async () => {
      await setup();
      skipWelcomeScreen();
      skipLanguageStep();
      await submitUserInfoStep();

      selectUsageReason("embedding");
      clickNextStep();

      screen.getByText("Finish").click();

      await waitFor(async () =>
        expect(await getLastSettingsPutPayload()).toBeTruthy(),
      );

      expect(await getLastSettingsPutPayload()).toEqual({
        "embedding-homepage": "visible",
        "enable-embedding": true,
        "embedding-secret-key": MOCK_RANDOM_TOKEN,
        "setup-embedding-autoenabled": true,
        "setup-license-active-at-setup": false,
      });
    });

    it("should not set 'embedding-homepage' when not interested in embedding", async () => {
      await setup();
      skipWelcomeScreen();
      skipLanguageStep();
      await submitUserInfoStep();

      selectUsageReason("self-service-analytics");
      clickNextStep();

      screen.getByText("I'll add my data later").click();

      screen.getByText("Finish").click();

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
      skipWelcomeScreen();
      skipLanguageStep();
      await submitUserInfoStep();

      selectUsageReason("embedding");
      clickNextStep();

      screen.getByText("Finish").click();

      const flags = await getLastSettingsPutPayload();

      expect(flags).toEqual({
        "embedding-homepage": "visible",
        "setup-license-active-at-setup": false,
      });
    });
  });
});
