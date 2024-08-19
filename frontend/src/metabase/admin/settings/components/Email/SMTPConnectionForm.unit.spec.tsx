import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupEmailEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { SettingDefinition, Settings } from "metabase-types/api";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import type { SettingElement } from "../../types";

import type { SMTPConnectionFormProps } from "./SMTPConnectionForm";
import { SMTPConnectionForm } from "./SMTPConnectionForm";

const defaultSettings = {
  "email-configured": true,
} as Partial<Settings>;

const defaultElements = [
  {
    placeholder: "smtp.yourservice.com",
    key: "email-smtp-host",
    value: null,
    is_env_setting: false,
    env_name: "MB_EMAIL_SMTP_HOST",
    description: "The address of the SMTP server that handles your emails.",
    default: "Using value of env var $MB_EMAIL_SMTP_HOST",
    originalValue: null,
    display_name: "SMTP Host",
    type: "string",
    required: true,
    autoFocus: true,
  },
  {
    placeholder: "587",
    key: "email-smtp-port",
    value: 587,
    is_env_setting: false,
    env_name: "MB_EMAIL_SMTP_PORT",
    description: "The port your SMTP server uses for outgoing emails.",
    default: null,
    originalValue: 587,
    display_name: "SMTP Port",
    type: "number",
    required: true,
    validations: [["integer", "That's not a valid port number"]],
  },
  {
    placeholder: "none",
    key: "email-smtp-security",
    value: null,
    is_env_setting: false,
    env_name: "MB_EMAIL_SMTP_SECURITY",
    description: null,
    default: "none",
    originalValue: null,
    display_name: "SMTP Security",
    type: "radio",
    options: [
      { value: "none", name: "None" },
      { value: "ssl", name: "SSL" },
      { value: "tls", name: "TLS" },
      { value: "starttls", name: "STARTTLS" },
    ],
    defaultValue: "none",
  },
  {
    placeholder: "nicetoseeyou",
    key: "email-smtp-username",
    value: "ash@example.com",
    is_env_setting: false,
    env_name: "MB_EMAIL_SMTP_USERNAME",
    description: null,
    default: null,
    originalValue: "ash@example.com",
    display_name: "SMTP Username",
    type: "string",
  },
  {
    placeholder: "Shhh...",
    key: "email-smtp-password",
    value: "**********xy",
    is_env_setting: false,
    env_name: "MB_EMAIL_SMTP_PASSWORD",
    description: null,
    default: null,
    originalValue: "**********xy",
    display_name: "SMTP Password",
    type: "password",
  },
] as SettingElement[];

const defaultValues = {
  "email-smtp-host": null,
  "email-smtp-port": null,
  "email-smtp-security": "none",
  "email-smtp-username": null,
} as Settings;

const setup = ({ elements, settingValues }: SMTPConnectionFormProps) => {
  setupEmailEndpoints();
  setupSettingsEndpoints(elements as SettingDefinition[]);
  setupPropertiesEndpoints(settingValues);

  renderWithProviders(
    <SMTPConnectionForm elements={elements} settingValues={settingValues} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState(defaultSettings),
      }),
    },
  );
};

describe("SMTP connection form", () => {
  it("should render the smtp connection form", async () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Port/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Username/i)).toBeInTheDocument();
    expect(screen.getByText(/SMTP Password/i)).toBeInTheDocument();
  });

  it("should render all security options", () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("SSL")).toBeInTheDocument();
    expect(screen.getByText("TLS")).toBeInTheDocument();
    expect(screen.getByText("STARTTLS")).toBeInTheDocument();
  });

  it("should populate the host", () => {
    const values = {
      ...defaultValues,
      "email-smtp-host": "smtp.rotom.com",
    } as Settings;

    setup({ elements: defaultElements, settingValues: values });

    expect(screen.getByLabelText(/SMTP host/i)).toHaveDisplayValue(
      "smtp.rotom.com",
    );
  });

  it("should populate the port", () => {
    const values = {
      ...defaultValues,
      "email-smtp-port": 123,
    } as Settings;

    setup({ elements: defaultElements, settingValues: values });

    expect(screen.getByLabelText(/SMTP port/i)).toHaveDisplayValue("123");
  });

  it("should populate the passed security value", () => {
    const values = {
      ...defaultValues,
      "email-smtp-security": "ssl",
    } as Settings;

    setup({ elements: defaultElements, settingValues: values });

    expect(screen.getByLabelText("SSL")).toBeChecked();
    expect(screen.getByLabelText("TLS")).not.toBeChecked();
  });

  it("should populate the username", () => {
    const values = {
      ...defaultValues,
      "email-smtp-username": "misty@example.com",
    } as Settings;

    setup({ elements: defaultElements, settingValues: values });

    expect(screen.getByLabelText(/SMTP username/i)).toHaveDisplayValue(
      "misty@example.com",
    );
  });

  it("should populate the password", () => {
    const values = {
      ...defaultValues,
      "email-smtp-password": "*****chu",
    } as Settings;

    setup({ elements: defaultElements, settingValues: values });

    expect(screen.getByLabelText(/SMTP password/i)).toHaveDisplayValue(
      "*****chu",
    );
  });

  it("should show save button as disabled when required fields are empty", () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });

  it("should show save button as enabled when required fields are filled", async () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/SMTP host/i), "smtp.rotom.com");
    await userEvent.type(screen.getByLabelText(/SMTP port/i), "123");

    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeEnabled();

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
  });

  it("should submit all settings changes via api", async () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    await userEvent.type(screen.getByLabelText(/SMTP host/i), "smtp.rotom.com");
    await userEvent.type(screen.getByLabelText(/SMTP port/i), "123");
    await userEvent.click(screen.getByLabelText("TLS"));
    await userEvent.type(
      screen.getByLabelText(/SMTP username/i),
      "misty@example.com",
    );
    await userEvent.type(
      screen.getByLabelText(/SMTP password/i),
      "iheartpikachu",
    );

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    const [emailApiCall] = fetchMock.calls();
    const body = await emailApiCall?.request?.json();

    expect(body).toEqual({
      "email-smtp-host": "smtp.rotom.com",
      "email-smtp-port": "123",
      "email-smtp-security": "tls",
      "email-smtp-username": "misty@example.com",
      "email-smtp-password": "iheartpikachu",
    });
  });

  it("should hide setting fields that are set by an environment variable", () => {
    const elements = [
      {
        ...defaultElements[0],
        is_env_setting: true,
      },
      ...defaultElements.slice(1),
    ];

    setup({ elements, settingValues: defaultValues });

    expect(screen.getByText(/this has been set by the/i)).toBeInTheDocument();
    expect(screen.getByText(/MB_EMAIL_SMTP_HOST/i)).toBeInTheDocument();
    expect(screen.getByText(/environment variable/i)).toBeInTheDocument();
  });

  it("should allow form submission when some fields are set by an environment variable", async () => {
    const elements = [
      {
        ...defaultElements[0],
        is_env_setting: true,
      },
      ...defaultElements.slice(1),
    ];

    setup({ elements, settingValues: defaultValues });

    expect(screen.getByText(/this has been set by the/i)).toBeInTheDocument();
    expect(screen.getByText(/MB_EMAIL_SMTP_HOST/i)).toBeInTheDocument();
    expect(screen.getByText(/environment variable/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/SMTP port/i), "123");
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

    const [emailApiCall] = fetchMock.calls();
    const body = await emailApiCall?.request?.json();

    expect(body).toEqual({
      "email-smtp-host": null,
      "email-smtp-port": "123",
      "email-smtp-security": "tls",
      "email-smtp-username": "misty@example.com",
      "email-smtp-password": "iheartpikachu",
    });
  });

  it("should enable test email button when all required fields are populated", async () => {
    const fullValues = {
      "email-smtp-host": "smtp.rotom.com",
      "email-smtp-port": 123,
      "email-smtp-security": "tls",
      "email-smtp-username": "misty@example.com",
      "email-smtp-password": "iheartpikachu",
    } as Settings;

    setup({ elements: defaultElements, settingValues: fullValues });

    expect(
      await screen.findByRole("button", { name: /send test email/i }),
    ).toBeEnabled();
  });

  it("should hide test email button when fields are missing", async () => {
    setup({ elements: defaultElements, settingValues: defaultValues });

    expect(
      screen.queryByRole("button", { name: /send test email/i }),
    ).not.toBeInTheDocument();
  });

  it("should hide test email button when form is dirty", async () => {
    const fullValues = {
      "email-smtp-host": "smtp.rotom.com",
      "email-smtp-port": 123,
      "email-smtp-security": "tls",
      "email-smtp-username": "misty@example.com",
      "email-smtp-password": "iheartpikachu",
    } as Settings;

    setup({ elements: defaultElements, settingValues: fullValues });

    expect(
      await screen.findByRole("button", { name: /send test email/i }),
    ).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/SMTP host/i), "smtp.rotom.com");
    expect(
      screen.queryByRole("button", { name: /send test email/i }),
    ).not.toBeInTheDocument();
  });

  it("should enable test email button when all fields are set by environment variables (metabase#45445)", async () => {
    const elements = defaultElements.map(el => ({
      ...el,
      is_env_setting: true,
    }));

    setup({ elements, settingValues: defaultValues });
    expect(
      await screen.findByRole("button", { name: /send test email/i }),
    ).toBeEnabled();
  });
});
