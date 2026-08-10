import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateLlmProviderEndpoint,
  setupUpdateLlmProviderEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { LlmProviderConnection } from "metabase-types/api";
import {
  createMockLlmProviderConnection,
  createMockLlmProviderField,
  createMockLlmProviderType,
} from "metabase-types/api/mocks";

import { ProviderConnectionForm } from "./ProviderConnectionForm";

const PROVIDER_TYPE = createMockLlmProviderType({
  type: "anthropic",
  label: "Anthropic",
  fields: [createMockLlmProviderField({ key: "api_key", label: "API key" })],
});

const setup = () => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  setupCreateLlmProviderEndpoint();
  const onSaved = jest.fn();

  renderWithProviders(
    <ProviderConnectionForm
      providerTypes={[PROVIDER_TYPE]}
      onSaved={onSaved}
    />,
  );

  return { onSaved };
};

const selectProviderAndFillKey = async (apiKey: string) => {
  await userEvent.click(screen.getByRole("button", { name: /Anthropic/ }));
  await userEvent.type(await screen.findByLabelText(/API key/), apiKey);
};

describe("ProviderConnectionForm", () => {
  it("focuses the first field after picking a provider", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: /Anthropic/ }));

    expect(await screen.findByLabelText(/API key/)).toHaveFocus();
  });

  it("connects when pressing enter in a field", async () => {
    const { onSaved } = setup();

    await selectProviderAndFillKey("sk-ant-123");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(
      await fetchMock.callHistory
        .lastCall("path:/api/llm/providers", { method: "POST" })
        ?.request?.json(),
    ).toEqual({
      type: "anthropic",
      name: "Anthropic",
      config: { api_key: "sk-ant-123" },
    });
  });

  it("does not connect when pressing enter before the required field is filled", async () => {
    const { onSaved } = setup();

    await userEvent.click(screen.getByRole("button", { name: /Anthropic/ }));
    await userEvent.click(await screen.findByLabelText(/API key/));
    await userEvent.keyboard("{Enter}");

    expect(onSaved).not.toHaveBeenCalled();
    expect(
      fetchMock.callHistory.calls("path:/api/llm/providers", {
        method: "POST",
      }),
    ).toHaveLength(0);
  });

  it("does not connect when toggling advanced settings", async () => {
    const { onSaved } = setup();

    await selectProviderAndFillKey("sk-ant-123");
    await userEvent.click(
      screen.getByRole("button", { name: /Advanced settings/ }),
    );

    expect(onSaved).not.toHaveBeenCalled();
    expect(
      fetchMock.callHistory.calls("path:/api/llm/providers", {
        method: "POST",
      }),
    ).toHaveLength(0);
  });

  it("does not connect when going back to the provider picker", async () => {
    const { onSaved } = setup();

    await selectProviderAndFillKey("sk-ant-123");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onSaved).not.toHaveBeenCalled();
    expect(
      fetchMock.callHistory.calls("path:/api/llm/providers", {
        method: "POST",
      }),
    ).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Anthropic/ })).toBeEnabled();
  });
});

const GOOGLE_TYPE = createMockLlmProviderType({
  type: "google",
  label: "Google Gemini",
  fields: [
    createMockLlmProviderField({
      key: "auth-method",
      label: "Authentication method",
      type: "segmented",
      required: true,
      options: [
        { value: "service-account-key", label: "Service account key" },
        { value: "oauth-token", label: "OAuth token" },
      ],
      default: "service-account-key",
    }),
    createMockLlmProviderField({
      key: "service-account-key",
      label: "Service account key file",
      type: "file",
      required: false,
      placeholder: "Click to select a file",
      show_when: { field: "auth-method", value: "service-account-key" },
    }),
    createMockLlmProviderField({
      key: "oauth-access-token",
      label: "OAuth access token",
      type: "password",
      required: false,
      show_when: { field: "auth-method", value: "oauth-token" },
    }),
  ],
});

const setupGoogle = (connection?: LlmProviderConnection) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  setupCreateLlmProviderEndpoint();
  setupUpdateLlmProviderEndpoint();
  const onSaved = jest.fn();

  renderWithProviders(
    <ProviderConnectionForm
      providerTypes={[GOOGLE_TYPE]}
      connection={connection}
      onSaved={onSaved}
    />,
  );

  return { onSaved };
};

const pickGoogle = async () => {
  await userEvent.click(screen.getByRole("button", { name: /Google Gemini/ }));
  await screen.findByLabelText("Authentication method");
};

describe("ProviderConnectionForm with fields behind a choice", () => {
  it("shows the credential the chosen authentication method needs", async () => {
    setupGoogle();

    await pickGoogle();

    expect(
      screen.getByLabelText("Service account key file"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("OAuth access token"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "OAuth token" }));

    expect(
      await screen.findByLabelText("OAuth access token"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Service account key file"),
    ).not.toBeInTheDocument();
  });

  it("saves the contents of the uploaded key file", async () => {
    const { onSaved } = setupGoogle();
    const key = '{"type":"service_account"}';

    await pickGoogle();
    await userEvent.upload(
      screen.getByLabelText("Service account key file file input"),
      new File([key], "key.json", { type: "application/json" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(
      await fetchMock.callHistory
        .lastCall("path:/api/llm/providers", { method: "POST" })
        ?.request?.json(),
    ).toEqual({
      type: "google",
      name: "Google Gemini",
      // the authentication method is left to the default the registry already applies
      config: { "service-account-key": key },
    });
  });

  it("clears the credential the other authentication method left behind", async () => {
    const { onSaved } = setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini",
        config: {
          "auth-method": "service-account-key",
          "service-account-key": "**********nt",
        },
      }),
    );

    await userEvent.click(screen.getByRole("radio", { name: "OAuth token" }));
    await userEvent.type(
      await screen.findByLabelText("OAuth access token"),
      "ya29.x",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(
      await fetchMock.callHistory
        .lastCall("express:/api/llm/providers/:key", { method: "PUT" })
        ?.request?.json(),
    ).toEqual({
      name: "Google Gemini",
      config: {
        "auth-method": "oauth-token",
        "service-account-key": "",
        "oauth-access-token": "ya29.x",
      },
    });
  });
});
