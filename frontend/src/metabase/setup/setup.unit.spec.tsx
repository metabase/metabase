/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectSectionToHaveLabel", "expectSectionsToHaveLabelsInOrder"] }] */

import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { UsageReason } from "metabase-types/api";
import {
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { Setup } from "./components/Setup";
import type { SetupStep } from "./types";

async function setup({ step = "welcome" }: { step?: SetupStep } = {}) {
  localStorage.clear();
  jest.clearAllMocks();

  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
    settings: createMockSettingsState({
      "available-locales": [["en", "English"]],
    }),
  });

  fetchMock.post("path:/api/util/password_check", { valid: true });
  fetchMock.post("path:/api/setup", {});

  renderWithProviders(<Setup />, { storeInitialState: state });

  // there is some async stuff going on with the locale loading
  await screen.findByText("Let's get started");

  return;
}

describe("setup", () => {
  it("default step order should be correct", async () => {
    await setup();
    await skipWelcomeScreen();
    expectSectionToHaveLabel("What's your preferred language?", "1");
    expectSectionToHaveLabel("What should we call you?", "2");
    expectSectionToHaveLabel("What will you use Metabase for?", "3");
    expectSectionToHaveLabel("Add your data", "4");
    expectSectionToHaveLabel("Usage data preferences", "5");

    expectSectionsToHaveLabelsInOrder();
  });

  it("should keep steps in order through the whole setup", async () => {
    await setup();
    await skipWelcomeScreen();
    expectSectionsToHaveLabelsInOrder({ from: 0 });

    await skipLanguageStep();
    expectSectionsToHaveLabelsInOrder({ from: 1 });

    await submitUserInfoStep();
    expectSectionsToHaveLabelsInOrder({ from: 2 });

    await clickNextStep(); // Usage question
    expectSectionsToHaveLabelsInOrder({ from: 3 });

    await userEvent.click(screen.getByText("I'll add my data later"));
    expectSectionsToHaveLabelsInOrder({ from: 4 });
  });

  describe("Usage question", () => {
    async function setupForUsageQuestion() {
      await setup();
      await skipWelcomeScreen();
      await skipLanguageStep();
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

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should not set the flag for the embedding homepage", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("self-service-analytics");
        await clickNextStep();

        screen.getByText("I'll add my data later").click();

        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBeNull();
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

        expectSectionToHaveLabel("Usage data preferences", "4");
      });

      it("should set the flag for the embed homepage in the local storage", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("embedding");
        await clickNextStep();

        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBe("true");
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

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should set the flag for the embed homepage in the local storage", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("both");
        await clickNextStep();

        screen.getByText("I'll add my data later").click();

        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBe("true");
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

        expectSectionToHaveLabel("Add your data", "4");
        expectSectionToHaveLabel("Usage data preferences", "5");
      });

      it("should not set the flag for the embedding homepage", async () => {
        await setupForUsageQuestion();
        await selectUsageReason("self-service-analytics");
        await clickNextStep();

        screen.getByText("I'll add my data later").click();

        screen.getByRole("button", { name: "Finish" }).click();

        await screen.findByRole("link", { name: "Take me to Metabase" });

        expect(localStorage.getItem("showEmbedHomepage")).toBeNull();
      });
    });
  });
});

const getSection = (name: string) => screen.getByRole("listitem", { name });

const clickNextStep = () =>
  userEvent.click(screen.getByRole("button", { name: "Next" }));

const skipWelcomeScreen = () =>
  userEvent.click(screen.getByText("Let's get started"));

const skipLanguageStep = () => clickNextStep();

const submitUserInfoStep = async ({
  firstName = "John",
  lastName = "Smith",
  email = "john@example.org",
  companyName = "Acme",
  password = "Monkeyabc123",
} = {}) => {
  await userEvent.type(screen.getByLabelText("First name"), firstName);
  await userEvent.type(screen.getByLabelText("Last name"), lastName);
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(
    screen.getByLabelText("Company or team name"),
    companyName,
  );
  await userEvent.type(screen.getByLabelText("Create a password"), password);
  await userEvent.type(
    screen.getByLabelText("Confirm your password"),
    password,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  clickNextStep();
  // formik+yup validation is async, we need to wait for the submit to finish
  await waitFor(() =>
    expect(
      screen.queryByText("What should we call you?"),
    ).not.toBeInTheDocument(),
  );
};

const selectUsageReason = async (usageReason: UsageReason) => {
  const label = {
    "self-service-analytics": "Self-service analytics for my own company",
    embedding: "Embedding analytics into my application",
    both: "A bit of both",
    "not-sure": "Not sure yet",
  }[usageReason];

  await userEvent.click(screen.getByLabelText(label));
};

const expectSectionToHaveLabel = (sectionName: string, label: string) => {
  const section = getSection(sectionName);

  expect(within(section).getByText(label)).toBeInTheDocument();
};

const expectSectionsToHaveLabelsInOrder = ({
  from = 0,
}: {
  from?: number;
} = {}): void => {
  screen.getAllByRole("listitem").forEach((section, index) => {
    if (index >= from) {
      expect(within(section).getByText(`${index + 1}`)).toBeInTheDocument();
    }
  });
};
