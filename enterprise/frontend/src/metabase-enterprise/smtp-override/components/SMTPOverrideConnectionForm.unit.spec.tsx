import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupEmailOverrideEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettingKey,
  SettingDefinition,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SMTPOverrideConnectionForm } from "./SMTPOverrideConnectionForm";

const setup = async ({
  setEnvVars,
}: {
  settingsDefinitions?: {
    [K in EnterpriseSettingKey]?: SettingDefinition;
  };
  setEnvVars?: "none" | "all" | "host";
}) => {
  const settingsDefinitionsWithDefaults: {
    [K in EnterpriseSettingKey]?: SettingDefinition;
  } = {
    "email-smtp-host-override": createMockSettingDefinition({
      key: "email-smtp-host-override",
      value: "smtp.rotom.com",
      env_name: "MB_EMAIL_SMTP_HOST",
      is_env_setting: setEnvVars === "all" || setEnvVars === "host",
    }),
    "email-smtp-port-override": createMockSettingDefinition({
      key: "email-smtp-port-override",
      value: 465,
      env_name: "MB_EMAIL_SMTP_PORT",
      is_env_setting: setEnvVars === "all",
    }),
    "email-smtp-security-override": createMockSettingDefinition({
      key: "email-smtp-security-override",
      value: "ssl",
      env_name: "MB_EMAIL_SMTP_SECURITY",
      is_env_setting: setEnvVars === "all",
    }),
    "email-smtp-username-override": createMockSettingDefinition({
      key: "email-smtp-username-override",
      value: "misty@example.com",
      env_name: "MB_EMAIL_SMTP_USERNAME",
      is_env_setting: setEnvVars === "all",
    }),

    "email-smtp-password-override": createMockSettingDefinition({
      key: "email-smtp-password-override",
      value: "*****chu",
      env_name: "MB_EMAIL_SMTP_PASSWORD",
      is_env_setting: setEnvVars === "all",
    }),
  };
  setupEmailOverrideEndpoints();
  setupSettingsEndpoints(Object.values(settingsDefinitionsWithDefaults));
  const settingValues: any = {};
  Object.entries(settingsDefinitionsWithDefaults).forEach(([key, setting]) => {
    settingValues[key] = setting.value;
  });
  setupPropertiesEndpoints(createMockSettings(settingValues));

  renderWithProviders(<SMTPOverrideConnectionForm onClose={() => {}} />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        ...settingValues,
        "email-configured": true,
      }),
    }),
  });

  if (setEnvVars === "all") {
    await screen.findByText("MB_EMAIL_SMTP_USERNAME");
  } else {
    await screen.findByDisplayValue("misty@example.com");
  }
};

describe("SMTPOverrideConnectionForm", () => {
  it("should render the smtp connection form", async () => {
    await setup({});
    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Port/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Username/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Password/i)).toBeInTheDocument();
    expect(screen.getByText("SSL")).toBeInTheDocument();
    expect(screen.getByText("TLS")).toBeInTheDocument();
    expect(screen.getByText("STARTTLS")).toBeInTheDocument();

    // Security is required
    expect(screen.queryByText("None")).not.toBeInTheDocument();

    expect(
      await screen.findByDisplayValue("smtp.rotom.com"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/SMTP Host/i)).toHaveDisplayValue(
      "smtp.rotom.com",
    );
    expect(screen.getByDisplayValue("465")).toBeChecked();
    expect(screen.getByLabelText(/SMTP username/i)).toHaveDisplayValue(
      "misty@example.com",
    );
    expect(screen.getByLabelText(/SMTP password/i)).toHaveDisplayValue(
      "*****chu",
    );
  });

  it("disable save button correctly", async () => {
    await setup({});
    const saveButton = screen.getByRole("button", { name: /save changes/i });

    // starts disabled because there are no unsaved changes
    expect(saveButton).toBeDisabled();

    const hostInput = screen.getByLabelText(/SMTP host/i);

    await userEvent.clear(hostInput);

    await userEvent.type(hostInput, "smtp.treeko.com");
    await userEvent.click(screen.getByDisplayValue("587"));

    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeEnabled();

    await userEvent.clear(hostInput);

    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });

  it("should submit all settings changes via api", async () => {
    await setup({});
    const hostInput = screen.getByLabelText(/SMTP Host/i);
    const usernameInput = screen.getByLabelText(/SMTP Username/i);
    const passwordInput = screen.getByLabelText(/SMTP Password/i);

    await userEvent.clear(hostInput);
    await userEvent.clear(usernameInput);
    await userEvent.clear(passwordInput);

    await userEvent.type(hostInput, "smtp.treeko.com");
    await userEvent.click(screen.getByDisplayValue("587"));
    await userEvent.type(usernameInput, "ash@example.com");
    await userEvent.type(passwordInput, "teamrocket");
    await userEvent.click(screen.getByLabelText("TLS"));

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    const puts = await findRequests("PUT");
    const { url, body } = puts[0];

    expect(url).toContain("/api/ee/email/override");
    expect(body).toEqual({
      "email-smtp-host-override": "smtp.treeko.com",
      "email-smtp-port-override": 587,
      "email-smtp-security-override": "tls",
      "email-smtp-username-override": "ash@example.com",
      "email-smtp-password-override": "teamrocket",
    });
  });

  it("should hide setting fields that are set by an environment variable", async () => {
    await setup({ setEnvVars: "host" });
    expect(screen.getByText(/this has been set by the/i)).toBeInTheDocument();
    expect(screen.getByText(/MB_EMAIL_SMTP_HOST/i)).toBeInTheDocument();
    expect(screen.getByText(/environment variable/i)).toBeInTheDocument();
  });

  it("should allow form submission when some fields are set by an environment variable", async () => {
    await setup({ setEnvVars: "host" });
    expect(screen.getByText(/this has been set by the/i)).toBeInTheDocument();
    expect(screen.getByText(/MB_EMAIL_SMTP_HOST/i)).toBeInTheDocument();
    expect(screen.getByText(/environment variable/i)).toBeInTheDocument();

    await userEvent.click(screen.getByDisplayValue("587"));
    await userEvent.click(screen.getByLabelText("TLS"));
    await userEvent.type(
      screen.getByLabelText(/SMTP username/i),
      "misty@example.com",
    );
    await userEvent.type(
      screen.getByLabelText(/SMTP password/i),
      "iheartpikachu",
    );

    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
  });
});
