import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupLlmModelsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockLlmConnectionModels,
  createMockLlmModel,
  createMockSettings,
} from "metabase-types/api/mocks";

import { LlmModelPicker } from "./LlmModelPicker";

const setup = (putResponse: number | object) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupLlmModelsEndpoint([
    createMockLlmConnectionModels({
      key: "anthropic",
      name: "Anthropic",
      models: [
        createMockLlmModel({ id: "claude-x", display_name: "Claude X" }),
      ],
    }),
  ]);
  fetchMock.put("path:/api/setting/llm-metabot-provider", putResponse);
  return renderWithProviders(<LlmModelPicker />);
};

const pickModel = async () => {
  // the picker is disabled until the model list lands, and a click on a disabled input opens nothing
  const input = await screen.findByRole("textbox");
  await waitFor(() => expect(input).toBeEnabled());
  await userEvent.click(input);
  await userEvent.click(
    await screen.findByRole("option", { name: /Claude X/ }),
  );
};

describe("LlmModelPicker save feedback", () => {
  it("surfaces the server's message when saving fails", async () => {
    const { store } = setup({
      status: 400,
      body: { message: 'Invalid Azure model "nope".' },
    });

    await pickModel();

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({
          message: 'Invalid Azure model "nope".',
          toastColor: "feedback-negative",
        }),
      );
    });
  });

  it("confirms the save when it succeeds", async () => {
    const { store } = setup(200);

    await pickModel();

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({ message: "Changes saved" }),
      );
    });
    expect(
      fetchMock.callHistory.calls("path:/api/setting/llm-metabot-provider"),
    ).toHaveLength(1);
  });
});
