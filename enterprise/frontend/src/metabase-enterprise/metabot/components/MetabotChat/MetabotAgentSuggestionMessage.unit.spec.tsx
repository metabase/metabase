import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  MetabotSuggestedTransform,
  MetabotTransformInfo,
} from "metabase-types/api";
import {
  createMockNativeDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockPythonTransformSource,
  createMockTransform,
} from "metabase-types/api/mocks/transform";
import { createMockState } from "metabase-types/store/mocks";

import type { MetabotAgentEditSuggestionChatMessage } from "../../state/types";

import { AgentSuggestionMessage } from "./MetabotAgentSuggestionMessage";

const createMockSuggestedTransform = (
  overrides: Partial<MetabotSuggestedTransform>,
): MetabotSuggestedTransform => ({
  ...createMockTransform(),
  suggestionId: "suggestion-123",
  active: false,
  ...overrides,
});

const createMockTransformInfo = (
  overrides: Partial<MetabotTransformInfo>,
): MetabotTransformInfo => ({
  type: "transform",
  ...createMockTransform(),
  ...overrides,
});

const createMockTransformSuggestionMessage = (
  overrides: Partial<MetabotAgentEditSuggestionChatMessage>,
): MetabotAgentEditSuggestionChatMessage => ({
  id: "msg-123",
  role: "agent",
  type: "edit_suggestion",
  model: "transform",
  payload: {
    editorTransform: undefined,
    suggestedTransform: createMockSuggestedTransform({}),
  },
  ...overrides,
});

const setup = (message: MetabotAgentEditSuggestionChatMessage) => {
  setupEnterprisePlugins();
  return renderWithProviders(<AgentSuggestionMessage message={message} />, {
    storeInitialState: createMockState({
      settings: mockSettings(),
      currentUser: createMockUser(),
    }),
  });
};

describe("AgentSuggestionMessage", () => {
  it("should show proposal for new transforms", async () => {
    setup(
      createMockTransformSuggestionMessage({
        payload: {
          editorTransform: undefined,
          suggestedTransform: createMockSuggestedTransform({
            id: undefined,
            source: {
              type: "query",
              query: createMockNativeDatasetQuery(),
            },
          }),
        },
      }),
    );

    expect(await screen.findByText("New")).toBeInTheDocument();
    expect(await screen.findByRole("textbox")).toHaveValue("SELECT 1");
    expect(
      await screen.findByRole("button", { name: /Create/ }),
    ).toBeInTheDocument();
  });

  it("should show diff view for edited transforms", async () => {
    setup(
      createMockTransformSuggestionMessage({
        payload: {
          editorTransform: createMockTransformInfo({
            id: 123,
            source: createMockPythonTransformSource({
              body: "# Original code\nprint('original')",
            }),
          }),
          suggestedTransform: createMockSuggestedTransform({
            id: 123,
            source: createMockPythonTransformSource({
              body: "# Updated code\nprint('updated')",
            }),
          }),
        },
      }),
    );

    expect(await screen.findByText("Revision")).toBeInTheDocument();
    // NOTE: jsdom has limitations around contenteditable, so we can't assert on old source being visible
    expect(await screen.findByRole("textbox")).toHaveValue(
      "# Updated code\nprint('updated')",
    );
    expect(
      await screen.findByRole("button", { name: /Apply/ }),
    ).toBeInTheDocument();
  });

  it("should be collapsible", async () => {
    setup(
      createMockTransformSuggestionMessage({
        payload: {
          editorTransform: undefined,
          suggestedTransform: createMockSuggestedTransform({
            id: undefined, // Make sure this is a new transform
            name: "Test Transform",
          }),
        },
      }),
    );

    // Initially opened (default state) - content should be visible
    const transformName = await screen.findByText("Test Transform");
    expect(transformName).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /create/i }),
    ).toBeInTheDocument();

    // Click header to collapse
    await userEvent.click(transformName);

    // Should be collapsed - content should not be visible
    expect(
      screen.queryByRole("button", { name: /create/i }),
    ).not.toBeInTheDocument();

    // Click header again to expand
    await userEvent.click(transformName);

    // Should be expanded again - content should be visible
    expect(
      await screen.findByRole("button", { name: /create/i }),
    ).toBeInTheDocument();
  });
});
