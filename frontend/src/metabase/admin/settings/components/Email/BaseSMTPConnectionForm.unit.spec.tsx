import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { BaseSMTPConnectionForm } from "./BaseSMTPConnectionForm";

const setup = async ({
  secureMode = false,
  propOverrides = {},
  setEnvVars = "none",
}: {
  secureMode?: boolean;
  propOverrides?: any;
  setEnvVars?: "none" | "all" | "host";
} = {}) => {
  renderWithProviders(
    <BaseSMTPConnectionForm
      onClose={() => {}}
      settingValues={{
        host: "smtp.example.com",
        port: 587,
        security: "tls",
        username: "user@example.com",
        password: "password123",
        ...propOverrides?.settingValues,
      }}
      settingsDetails={{
        host: {
          is_env_setting: setEnvVars === "all" || setEnvVars === "host",
          env_name: "MB_EMAIL_SMTP_HOST",
          description: "SMTP host server",
          display_name: "SMTP Host",
        },
        port: {
          is_env_setting: setEnvVars === "all",
          env_name: "MB_EMAIL_SMTP_PORT",
          description: "SMTP port number",
          display_name: "SMTP Port",
        },
        security: {
          is_env_setting: setEnvVars === "all",
          env_name: "MB_EMAIL_SMTP_SECURITY",
          description: "SMTP security protocol",
          display_name: "SMTP Security",
        },
        username: {
          is_env_setting: setEnvVars === "all",
          env_name: "MB_EMAIL_SMTP_USERNAME",
          description: "SMTP username",
          display_name: "SMTP Username",
        },
        password: {
          is_env_setting: setEnvVars === "all",
          env_name: "MB_EMAIL_SMTP_PASSWORD",
          description: "SMTP password",
          display_name: "SMTP Password",
        },
        ...propOverrides?.settingsDetails,
      }}
      secureMode={secureMode}
      updateMutation={jest
        .fn()
        .mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) })}
      deleteMutation={jest.fn().mockResolvedValue({})}
      dataTestId="test-smtp-form"
      onTrackSuccess={jest.fn()}
      {...propOverrides}
    />,
  );

  // Wait for form to load based on environment variable state
  if (setEnvVars === "all") {
    await screen.findByText("MB_EMAIL_SMTP_USERNAME");
  } else if (propOverrides?.settingValues?.username === "") {
    await screen.findByText("SMTP Configuration");
  } else {
    await screen.findByDisplayValue("user@example.com");
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
      expect(screen.getByDisplayValue("user@example.com")).toBeInTheDocument();
      expect(screen.getByDisplayValue("password123")).toBeInTheDocument();
    });

    it("should call updateMutation with form data when submitted", async () => {
      const mockUpdate = jest
        .fn()
        .mockReturnValue({ unwrap: jest.fn().mockResolvedValue({}) });

      await setup({
        secureMode: false,
        propOverrides: { updateMutation: mockUpdate },
      });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.newhost.com");

      await userEvent.click(
        screen.getByRole("button", { name: /save changes/i }),
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        host: "smtp.newhost.com",
        port: 587,
        security: "tls",
        username: "user@example.com",
        password: "password123",
      });
    });
  });

  describe("secureMode=true (override)", () => {
    it("should render form with chip selection for port and exclude 'None' security option", async () => {
      await setup({ secureMode: true });

      // Port should be chips, not text input
      expect(screen.queryByLabelText(/SMTP Port/i)).not.toBeInTheDocument();
      expect(screen.getByText("465")).toBeInTheDocument();
      expect(screen.getByText("587")).toBeInTheDocument();
      expect(screen.getByText("2525")).toBeInTheDocument();

      // Security options should NOT include "None"
      expect(screen.queryByText("None")).not.toBeInTheDocument();
      expect(screen.getByText("SSL")).toBeInTheDocument();
      expect(screen.getByText("TLS")).toBeInTheDocument();
      expect(screen.getByText("STARTTLS")).toBeInTheDocument();
    });

    it("should default to secure values when secureMode=true", async () => {
      await setup({
        secureMode: true,
        propOverrides: {
          settingValues: {
            host: "",
            port: null,
            security: null,
            username: "",
            password: "",
          },
        },
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

  describe("environment variable handling", () => {
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

  describe("form interactions", () => {
    it("should enable save button when form is dirty and valid", async () => {
      await setup({ secureMode: false });

      const saveButton = screen.getByRole("button", { name: /save changes/i });
      expect(saveButton).toBeDisabled(); // starts disabled

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.newhost.com");

      expect(saveButton).toBeEnabled();
    });

    it("should call deleteMutation when clear button is clicked", async () => {
      const mockDelete = jest.fn().mockResolvedValue({});

      await setup({
        secureMode: false,
        propOverrides: { deleteMutation: mockDelete },
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
        propOverrides: {
          updateMutation: mockUpdate,
          onTrackSuccess: mockTrack,
        },
      });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.newhost.com");

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
        propOverrides: {
          onClose: mockClose,
          updateMutation: mockUpdate,
        },
      });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      await userEvent.clear(hostInput);
      await userEvent.type(hostInput, "smtp.newhost.com");

      await userEvent.click(
        screen.getByRole("button", { name: /save changes/i }),
      );

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("should disable save button when required field is empty", async () => {
      await setup({ secureMode: false });

      const hostInput = screen.getByLabelText(/SMTP Host/i);
      const saveButton = screen.getByRole("button", { name: /save changes/i });

      await userEvent.clear(hostInput);

      expect(saveButton).toBeDisabled();
    });

    it("should validate port field in secure mode", async () => {
      await setup({ secureMode: true });

      // In secure mode, only specific ports should be available as chips
      expect(screen.getByDisplayValue("465")).toBeInTheDocument();
      expect(screen.getByDisplayValue("587")).toBeInTheDocument();
      expect(screen.getByDisplayValue("2525")).toBeInTheDocument();

      // No other port options should be available
      expect(screen.queryByDisplayValue("25")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("993")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper test id on modal", async () => {
      await setup({ secureMode: false });

      expect(screen.getByTestId("test-smtp-form")).toBeInTheDocument();
    });

    it("should have accessible form labels", async () => {
      await setup({ secureMode: false });

      expect(screen.getByLabelText(/SMTP Host/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Port/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SMTP Password/i)).toBeInTheDocument();
    });
  });
});
