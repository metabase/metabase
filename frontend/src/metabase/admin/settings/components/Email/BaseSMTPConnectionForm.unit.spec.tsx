import userEvent from "@testing-library/user-event";

import {
  setupEmailEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type {
  EnterpriseSettingKey,
  SettingDefinition,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { BaseSMTPConnectionForm } from "./BaseSMTPConnectionForm";

const setup = async ({
  secureMode = false,
  setEnvVars = "none",
  useDefaultValues,
  onClose,
  updateMutation,
  deleteMutation,
  dataTestId,
  onTrackSuccess,
}: {
  secureMode?: boolean;
  useDefaultValues?: boolean;
  setEnvVars?: "none" | "all" | "host";
  settingValues?: any;
  settingsDetails?: any;
  onClose?: any;
  updateMutation?: any;
  deleteMutation?: any;
  dataTestId?: string;
  onTrackSuccess?: any;
} = {}) => {
  const settingsDefinitionsWithDefaults: {
    [K in EnterpriseSettingKey]?: SettingDefinition;
  } = {
    "email-smtp-host": createMockSettingDefinition({
      key: "email-smtp-host",
      value: useDefaultValues ? "" : "smtp.example.com",
      env_name: "MB_EMAIL_SMTP_HOST",
      is_env_setting: setEnvVars === "all" || setEnvVars === "host",
    }),
    "email-smtp-port": createMockSettingDefinition({
      key: "email-smtp-port",
      value: useDefaultValues ? null : 587,
      env_name: "MB_EMAIL_SMTP_PORT",
      is_env_setting: setEnvVars === "all",
    }),
    "email-smtp-security": createMockSettingDefinition({
      key: "email-smtp-security",
      value: useDefaultValues ? null : "tls",
      env_name: "MB_EMAIL_SMTP_SECURITY",
      is_env_setting: setEnvVars === "all",
    }),
    "email-smtp-username": createMockSettingDefinition({
      key: "email-smtp-username",
      value: useDefaultValues ? "" : "red@example.com",
      env_name: "MB_EMAIL_SMTP_USERNAME",
      is_env_setting: setEnvVars === "all",
    }),

    "email-smtp-password": createMockSettingDefinition({
      key: "email-smtp-password",
      value: useDefaultValues ? "" : "password123",
      env_name: "MB_EMAIL_SMTP_PASSWORD",
      is_env_setting: setEnvVars === "all",
    }),
  };
  setupEmailEndpoints();
  setupSettingsEndpoints(Object.values(settingsDefinitionsWithDefaults));
  const settingValues: any = {};
  Object.entries(settingsDefinitionsWithDefaults).forEach(([key, setting]) => {
    settingValues[key] = setting.value;
  });
  setupPropertiesEndpoints(createMockSettings(settingValues));
  renderWithProviders(
    <>
      <BaseSMTPConnectionForm
        onClose={onClose || jest.fn()}
        getFullFormKey={(shortFormKey) => {
          const mapFormKeyToSettingKey = {
            host: "email-smtp-host",
            port: "email-smtp-port",
            security: "email-smtp-security",
            username: "email-smtp-username",
            password: "email-smtp-password",
          } as const;
          return mapFormKeyToSettingKey[shortFormKey];
        }}
        secureMode={secureMode}
        updateMutation={
          updateMutation ||
          jest.fn().mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) })
        }
        deleteMutation={deleteMutation || jest.fn().mockResolvedValue({})}
        dataTestId={dataTestId || "test-smtp-form"}
        onTrackSuccess={onTrackSuccess || jest.fn()}
      />
      <UndoListing />
    </>,
  );

  if (setEnvVars === "all") {
    await screen.findByText("MB_EMAIL_SMTP_USERNAME");
  } else if (useDefaultValues) {
    await screen.findByText("SMTP Configuration");
  } else {
    await screen.findByDisplayValue("red@example.com");
  }
};

describe("BaseSMTPConnectionForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("secureMode=false (self-hosted)", () => {
    it("should render form with text input for port and include 'None' security option", async () => {
      await setup({ secureMode: false });

      expect(screen.getByText("SMTP Configuration")).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Host/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Port/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Password/i)).toBeInTheDocument();

      // Port should be a text input (not chips)
      expect(screen.getByLabelText(/SMTP Port/i)).toBeInTheDocument();

      // Security options should include "None"
      expect(screen.getByText("None")).toBeInTheDocument();
      expect(screen.getByText("SSL")).toBeInTheDocument();
      expect(screen.getByText("TLS")).toBeInTheDocument();
      expect(screen.getByText("STARTTLS")).toBeInTheDocument();
    });

    it("should populate form with initial values", async () => {
      await setup({ secureMode: false });

      expect(screen.getByDisplayValue("smtp.example.com")).toBeInTheDocument();
      expect(screen.getByDisplayValue("587")).toBeInTheDocument();
      expect(screen.getByDisplayValue("red@example.com")).toBeInTheDocument();
      expect(screen.getByDisplayValue("password123")).toBeInTheDocument();
    });

    it("should call updateMutation with form data when submitted", async () => {
      const mockUpdate = jest
        .fn()
        .mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

      await setup({
        secureMode: false,
        updateMutation: mockUpdate,
      });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.torchic.com");

      await userEvent.click(
        screen.getByRole("button", { name: /save changes/i }),
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        "email-smtp-host": "smtp.torchic.com",
        "email-smtp-port": 587,
        "email-smtp-security": "tls",
        "email-smtp-username": "red@example.com",
        "email-smtp-password": "password123",
      });
    });

    it("should display form errors when update fails", async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        unwrap: jest.fn().mockRejectedValue({
          status: 400,
          data: {
            errors: {
              "email-smtp-host": "Wrong host or port",
              "email-smtp-port": "Wrong host or port",
            },
          },
          isCancelled: false,
        }),
      });

      await setup({
        secureMode: false,
        updateMutation: mockUpdate,
      });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.torchic.com");

      await userEvent.click(
        screen.getByRole("button", { name: /save changes/i }),
      );
      await waitFor(() => {
        const toasts = screen.getAllByLabelText("warning icon");
        expect(toasts).toHaveLength(1);
      });

      expect(await screen.findAllByText("Wrong host or port")).toHaveLength(2);
    });
  });

  describe("secureMode=true (override)", () => {
    it("should render form with chip selection for port and exclude 'None' security option", async () => {
      await setup({ secureMode: true });

      expect(screen.queryByLabelText(/SMTP Port/i)).not.toBeInTheDocument();
      expect(screen.getByText("465")).toBeInTheDocument();
      expect(screen.getByText("587")).toBeInTheDocument();
      expect(screen.getByText("2525")).toBeInTheDocument();

      expect(screen.queryByText("None")).not.toBeInTheDocument();
      expect(screen.getByText("SSL")).toBeInTheDocument();
      expect(screen.getByText("TLS")).toBeInTheDocument();
      expect(screen.getByText("STARTTLS")).toBeInTheDocument();
    });

    it("should default to secure values when secureMode=true", async () => {
      await setup({
        secureMode: true,
        useDefaultValues: true,
      });

      // Should default to secure port and security
      expect(screen.getByDisplayValue("465")).toBeChecked();
      expect(screen.getByLabelText("SSL")).toBeChecked();
    });

    it("should select port chip when clicked", async () => {
      await setup({ secureMode: true });

      await userEvent.click(screen.getByDisplayValue("2525"));
      expect(screen.getByDisplayValue("2525")).toBeChecked();
    });
  });

  it("should enable save button when form is dirty and valid", async () => {
    await setup({ secureMode: false });

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled(); // starts disabled

    const hostInput = screen.getByLabelText(/SMTP Host/i);
    await userEvent.clear(hostInput);
    await userEvent.type(hostInput, "smtp.torchic.com");

    expect(saveButton).toBeEnabled();
  });

  it("should call deleteMutation when clear button is clicked", async () => {
    const mockDelete = jest.fn().mockResolvedValue({});

    await setup({
      secureMode: false,
      deleteMutation: mockDelete,
    });

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(mockDelete).toHaveBeenCalled();
  });

  it("should call onTrackSuccess after successful form submission", async () => {
    const mockTrack = jest.fn();
    const mockUpdate = jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    });

    await setup({
      secureMode: false,
      updateMutation: mockUpdate,
      onTrackSuccess: mockTrack,
    });

    const hostInput = screen.getByLabelText(/SMTP Host/i);
    await userEvent.clear(hostInput);
    await userEvent.type(hostInput, "smtp.torchic.com");

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    expect(mockTrack).toHaveBeenCalled();
  });

  it("should close modal after successful submission", async () => {
    const mockClose = jest.fn();
    const mockUpdate = jest.fn().mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({}),
    });

    await setup({
      secureMode: false,
      onClose: mockClose,
      updateMutation: mockUpdate,
    });

    const hostInput = screen.getByLabelText(/SMTP Host/i);
    await userEvent.clear(hostInput);
    await userEvent.type(hostInput, "smtp.torchic.com");

    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    expect(mockClose).toHaveBeenCalled();
  });

  it("should disable save button when required field is empty", async () => {
    await setup({ secureMode: false });

    const hostInput = screen.getByLabelText(/SMTP Host/i);
    const saveButton = screen.getByRole("button", { name: /save changes/i });

    await userEvent.clear(hostInput);

    expect(saveButton).toBeDisabled();
  });

  it("should show env var message when field is set by env var", async () => {
    await setup({ setEnvVars: "host" });

    expect(screen.getByText("MB_EMAIL_SMTP_HOST")).toBeInTheDocument();
    expect(screen.queryByLabelText(/SMTP Host/i)).not.toBeInTheDocument();
  });

  it("should disable clear button when all fields are set by env vars", async () => {
    await setup({ setEnvVars: "all" });

    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
  });
});
