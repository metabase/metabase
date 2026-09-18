import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateLlmProviderEndpoint,
  setupUpdateLlmProviderEndpoint,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
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
  label: "Google Gemini Enterprise",
  default_model: "google/gemini-3.5-flash",
  models: [
    { id: "google/gemini-3.5-flash", display_name: "Gemini 3.5 Flash" },
    { id: "google/gemini-3.6-flash", display_name: "Gemini 3.6 Flash" },
    {
      id: "anthropic/claude-sonnet-4-6",
      display_name: "Claude Sonnet 4.6",
    },
  ],
  required_any: [["service-account-key"], ["oauth-access-token", "project-id"]],
  fields: [
    createMockLlmProviderField({
      key: "project-id",
      label: "Project ID",
      type: "text",
      required: false,
    }),
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

const setupGoogle = (
  connection?: LlmProviderConnection,
  { modelRef }: { modelRef?: string } = {},
) => {
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
    {
      storeInitialState: {
        settings: mockSettings({ "llm-metabot-provider": modelRef ?? null }),
      },
    },
  );

  return { onSaved };
};

const pickGoogle = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: /Google Gemini Enterprise/ }),
  );
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
      name: "Google Gemini Enterprise",
      // the authentication method is left to the default the registry already applies
      config: { "service-account-key": key },
      model: "google/gemini-3.5-flash",
    });
  });

  it("clears the credential the other authentication method left behind", async () => {
    const { onSaved } = setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
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
      name: "Google Gemini Enterprise",
      config: {
        "auth-method": "oauth-token",
        "service-account-key": "",
        "oauth-access-token": "ya29.x",
      },
      model: "google/gemini-3.5-flash",
    });
  });

  it("keeps Connect disabled until one credential group is complete", async () => {
    setupGoogle();

    await pickGoogle();

    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "OAuth token" }));
    await userEvent.type(
      await screen.findByLabelText("OAuth access token"),
      "ya29.x",
    );

    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Project ID"), "my-project");

    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
  });

  it("validates the connection against the model picked in the form", async () => {
    const { onSaved } = setupGoogle();
    const key = '{"type":"service_account"}';

    await pickGoogle();
    await userEvent.click(screen.getByLabelText("Model"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Gemini 3.6 Flash" }),
    );
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
      name: "Google Gemini Enterprise",
      config: { "service-account-key": key },
      model: "google/gemini-3.6-flash",
    });
  });
});

describe("ProviderConnectionForm editing a fixed-catalog connection", () => {
  it("starts the model picker on the model the connection is serving, not the type default", async () => {
    setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
        config: {
          "auth-method": "oauth-token",
          "oauth-access-token": "**********en",
          "project-id": "my-project",
        },
      }),
      { modelRef: "google/google/gemini-3.6-flash" },
    );

    expect(await screen.findByLabelText("Model")).toHaveValue(
      "Gemini 3.6 Flash",
    );
  });

  it("starts the model picker on the probed model when Metabot points at another connection", async () => {
    setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
        config: {
          "auth-method": "oauth-token",
          "oauth-access-token": "**********en",
          "project-id": "my-project",
          "probed-model": "anthropic/claude-sonnet-4-6",
        },
      }),
      { modelRef: "anthropic/claude-sonnet-4-6" },
    );

    expect(await screen.findByLabelText("Model")).toHaveValue(
      "Claude Sonnet 4.6",
    );
  });

  it("starts the model picker on the type default when there is no probed model", async () => {
    setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
        config: {
          "auth-method": "oauth-token",
          "oauth-access-token": "**********en",
          "project-id": "my-project",
        },
      }),
    );

    expect(await screen.findByLabelText("Model")).toHaveValue(
      "Gemini 3.5 Flash",
    );
  });

  it("starts the model picker on the type default when the probed model left the catalog", async () => {
    setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
        config: {
          "auth-method": "oauth-token",
          "oauth-access-token": "**********en",
          "project-id": "my-project",
          "probed-model": "google/gemini-2.0-flash",
        },
      }),
    );

    expect(await screen.findByLabelText("Model")).toHaveValue(
      "Gemini 3.5 Flash",
    );
  });

  it("disables the fields the environment owns and leaves the rest editable", async () => {
    setupGoogle(
      createMockLlmProviderConnection({
        key: "google",
        type: "google",
        name: "Google Gemini Enterprise",
        env_fields: ["project-id"],
        config: {
          "auth-method": "oauth-token",
          "oauth-access-token": "**********en",
          "project-id": "env-project",
        },
      }),
    );

    expect(await screen.findByLabelText("Project ID")).toBeDisabled();
    expect(screen.getByLabelText("OAuth access token")).toBeEnabled();
  });
});
