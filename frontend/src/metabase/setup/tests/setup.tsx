import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures, UsageReason } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { Setup } from "../components/Setup";
import type { SetupStep } from "../types";

export interface SetupOpts {
  step?: SetupStep;
  tokenFeatures?: TokenFeatures;
  hasEnterprisePlugins?: boolean;
}

export async function setup({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
}: SetupOpts = {}) {
  localStorage.clear();
  jest.clearAllMocks();

  const state = createMockState({
    setup: createMockSetupState({
      step: "welcome",
    }),
    settings: createMockSettingsState({
      "token-features": tokenFeatures,
      "available-locales": [["en", "English"]],
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  fetchMock.post("path:/api/util/password_check", { valid: true });
  fetchMock.post("path:/api/setup", {});

  renderWithProviders(<Setup />, { storeInitialState: state });

  // there is some async stuff going on with the locale loading
  await screen.findByText("Let's get started");

  return;
}

export const getSection = (name: string) =>
  screen.getByRole("listitem", { name });

export const clickNextStep = () =>
  userEvent.click(screen.getByRole("button", { name: "Next" }));

export const skipWelcomeScreen = () =>
  userEvent.click(screen.getByText("Let's get started"));

export const skipLanguageStep = () => clickNextStep();

export const submitUserInfoStep = async ({
  firstName = "John",
  lastName = "Smith",
  email = "john@example.org",
  companyName = "Acme",
  password = "Monkeyabc123",
} = {}) => {
  userEvent.type(screen.getByLabelText("First name"), firstName);
  userEvent.type(screen.getByLabelText("Last name"), lastName);
  userEvent.type(screen.getByLabelText("Email"), email);
  userEvent.type(screen.getByLabelText("Company or team name"), companyName);
  userEvent.type(screen.getByLabelText("Create a password"), password);
  userEvent.type(screen.getByLabelText("Confirm your password"), password);
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

export const selectUsageReason = (usageReason: UsageReason) => {
  const label = {
    "self-service-analytics": "Self-service analytics for my own company",
    embedding: "Embedding analytics into my application",
    both: "A bit of both",
    "not-sure": "Not sure yet",
  }[usageReason];

  userEvent.click(screen.getByLabelText(label));
};

export const expectSectionToHaveLabel = (
  sectionName: string,
  label: string,
) => {
  const section = getSection(sectionName);

  expect(within(section).getByText(label)).toBeInTheDocument();
};

export const expectSectionsToHaveLabelsInOrder = ({
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
