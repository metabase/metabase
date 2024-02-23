/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import {
  clickNextStep,
  expectSectionsToHaveLabelsInOrder,
  expectSectionToHaveLabel,
  findSection,
  getSection,
  selectUsageReason,
  setup,
  skipLanguageStep,
  skipWelcomeScreen,
  submitUserInfoStep,
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

    await await clickNextStep(); // Usage question

    expectSectionsToHaveLabelsInOrder({ from: 3 });

    userEvent.click(await screen.findByText("I'll add my data later"));

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
        await clickNextStep();

        expect(await screen.findByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should not set the flag for the embedding homepage", async () => {
        await setupForUsageQuestion();
        selectUsageReason("self-service-analytics");
        await clickNextStep();

        (await screen.findByText("I'll add my data later")).click();

        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBeNull();
      });
    });

    describe("when selecting 'Embedding'", () => {
      it("should hide the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("embedding");
        await clickNextStep();

        expect(screen.queryByText("Add your data")).not.toBeInTheDocument();

        await findSection("Usage data preferences");
        expect(getSection("Usage data preferences")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Usage data preferences", "4");
      });

      it("should set the flag for the embed homepage in the local storage", async () => {
        await setupForUsageQuestion();
        selectUsageReason("embedding");
        await clickNextStep();

        (await screen.findByRole("button", { name: "Finish" })).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBe("true");
      });
    });

    describe("when selecting 'A bit of both'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("both");
        await clickNextStep();

        expect(await screen.findByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should set the flag for the embed homepage in the local storage", async () => {
        await setupForUsageQuestion();
        selectUsageReason("both");
        await clickNextStep();

        await screen.findByText("I'll add my data later");
        (await screen.findByText("I'll add my data later")).click();

        await screen.findByRole("button", { name: "Finish" });
        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBe("true");
      });
    });

    describe("when selecting 'Not sure yet'", () => {
      it("should keep the 'Add your data' step", async () => {
        await setupForUsageQuestion();
        selectUsageReason("not-sure");
        await clickNextStep();

        await screen.findByText("Add your data");
        expect(await screen.findByText("Add your data")).toBeInTheDocument();

        expect(getSection("Add your data")).toHaveAttribute(
          "aria-current",
          "step",
        );

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should not set the flag for the embedding homepage", async () => {
        await setupForUsageQuestion();
        selectUsageReason("self-service-analytics");
        await clickNextStep();

        (await screen.findByText("I'll add my data later")).click();

        await screen.findByRole("button", { name: "Finish" });
        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBeNull();
      });
    });
  });
});
