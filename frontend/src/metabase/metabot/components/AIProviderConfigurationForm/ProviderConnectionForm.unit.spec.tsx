import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCreateLlmProviderEndpoint } from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
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
