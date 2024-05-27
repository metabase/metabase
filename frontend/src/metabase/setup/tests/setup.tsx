import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  SettingDefinition,
  TokenFeatures,
  UsageReason,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
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
  settingOverrides?: SettingDefinition[];
}

export async function setup({
  tokenFeatures = createMockTokenFeatures(),
  hasEnterprisePlugins = false,
  settingOverrides = [],
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
  fetchMock.put("path:/api/setting/anon-tracking-enabled", 200);
  setupPropertiesEndpoints(
    createMockSettings({ "token-features": tokenFeatures }),
  );
  setupSettingsEndpoints(settingOverrides);
  fetchMock.put("path:/api/setting", 200);

  renderWithProviders(<Setup />, { storeInitialState: state });

  // there is some async stuff going on with the locale loading
  await screen.findByText("Let's get started");

  return;
}

export const getSection = (name: string) =>
  screen.getByRole("listitem", { name });

export const clickNextStep = async () =>
  await userEvent.click(screen.getByRole("button", { name: "Next" }));

export const skipWelcomeScreen = async () =>
  await userEvent.click(screen.getByText("Let's get started"));

export const skipLanguageStep = clickNextStep;

export const submitUserInfoStep = async ({
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
  await clickNextStep();
  // formik+yup validation is async, we need to wait for the submit to finish
  await waitFor(() =>
    expect(
      screen.queryByText("What should we call you?"),
    ).not.toBeInTheDocument(),
  );
};

export const selectUsageReason = async (usageReason: UsageReason) => {
  const label = {
    "self-service-analytics": "Self-service analytics for my own company",
    embedding: "Embedding analytics into my application",
    both: "A bit of both",
    "not-sure": "Not sure yet",
  }[usageReason];

  await userEvent.click(screen.getByLabelText(label));
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
  screen.getAllByTestId("setup-step").forEach((section, index) => {
    if (index >= from) {
      expect(within(section).getByText(`${index + 1}`)).toBeInTheDocument();
    }
  });
};

export const getLastSettingsPutPayload = async () => {
  const lastSettingsCall = fetchMock.lastCall("path:/api/setting", {
    method: "PUT",
  });

  expect(lastSettingsCall).toBeTruthy();
  expect(lastSettingsCall![1]).toBeTruthy();

  return JSON.parse((await lastSettingsCall![1]!.body!) as string);
};
