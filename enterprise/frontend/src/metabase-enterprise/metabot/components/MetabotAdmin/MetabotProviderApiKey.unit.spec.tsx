import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { MetabotProviderApiKey } from "./MetabotProviderApiKey";

const SUCCESS_RESPONSE = {
  value: "anthropic/claude-haiku-4-5",
  models: [],
};

const setup = async ({
  shouldFail = true,
  isEnvSetting = false,
  pauseResponse = false,
}: {
  shouldFail?: boolean;
  isEnvSetting?: boolean;
  pauseResponse?: boolean;
} = {}) => {
  let maskedApiKey: string | null = null;
  let resolveRequest: (() => void) | null = null;

  setupPropertiesEndpoints(
    createMockSettings({
      "llm-anthropic-api-key": null,
    }),
  );
  fetchMock.get("path:/api/setting", () => [
    createMockSettingDefinition({
      key: "llm-anthropic-api-key",
      value: maskedApiKey,
      is_env_setting: isEnvSetting,
      env_name: isEnvSetting ? "LLM_ANTHROPIC_API_KEY" : "",
    }),
  ]);
  fetchMock.put("path:/api/metabot/settings", async (call) => {
    if (pauseResponse) {
      await new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
    }

    const body = JSON.parse(String(call.options?.body ?? "{}"));

    if (shouldFail) {
      return {
        status: 400,
        body: "Anthropic API key expired or invalid",
      };
    }

    maskedApiKey = body["api-key"] ? "**********id" : null;

    return {
      status: 200,
      body: SUCCESS_RESPONSE,
    };
  });

  renderWithProviders(<MetabotProviderApiKey provider="anthropic" />);

  const input = await screen.findByLabelText("API key");

  return {
    input,
    resolveRequest: () => resolveRequest?.(),
    setShouldFail: (value: boolean) => (shouldFail = value),
  };
};

describe("MetabotProviderApiKey", () => {
  it("shows API key verification errors on the API key field", async () => {
    const { input } = await setup();

    fireEvent.change(input, { target: { value: "sk-ant-invalid" } });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Anthropic API key expired or invalid"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Unable to load models."),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
        true,
      );
    });

    const request = fetchMock.callHistory
      .calls("path:/api/metabot/settings")
      .find((call) => call.request?.method === "PUT");

    expect(request?.options?.body).toBe(
      JSON.stringify({ provider: "anthropic", "api-key": "sk-ant-invalid" }),
    );
  });

  it("shows verifying API key while saving and hides it after success", async () => {
    const { input, resolveRequest } = await setup({
      shouldFail: false,
      pauseResponse: true,
    });

    fireEvent.change(input, { target: { value: "sk-ant-valid" } });
    const connectButton = screen.getByRole("button", { name: "Connect" });

    await userEvent.click(connectButton);

    await waitFor(() => {
      expect(connectButton).toHaveAttribute("data-loading", "true");
    });

    resolveRequest();

    await waitFor(() => {
      expect(connectButton).not.toHaveAttribute("data-loading", "true");
    });
  });

  it("resets local value and error after a successful save", async () => {
    const { input, setShouldFail } = await setup();

    fireEvent.change(input, { target: { value: "sk-ant-invalid" } });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Anthropic API key expired or invalid"),
    ).toBeInTheDocument();
    expect(input).toHaveValue("sk-ant-invalid");

    setShouldFail(false);
    fireEvent.change(input, { target: { value: "sk-ant-valid" } });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Anthropic API key expired or invalid"),
      ).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(input).toHaveValue("**********id");
    });
  });

  it("shows the env var message and disables the input when set by env var", async () => {
    const { input } = await setup({ isEnvSetting: true, shouldFail: false });

    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent(
      "This has been set by the LLM_ANTHROPIC_API_KEY environment variable.",
    );
    expect(input).toBeDisabled();
  });

  it("does not verify the API key until Connect is clicked", async () => {
    const { input } = await setup({ shouldFail: false });

    fireEvent.change(input, { target: { value: "sk-ant-valid" } });

    expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
      false,
    );

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/metabot/settings")).toBe(
        true,
      );
    });
  });
});
