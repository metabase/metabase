import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
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

import {
  AgentSuggestionMessage,
  type AgentSuggestionPayload,
} from "./MetabotAgentSuggestionMessage";

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

const createMockSuggestionPayload = (
  overrides: Partial<AgentSuggestionPayload> = {},
): AgentSuggestionPayload => ({
  editorTransform: undefined,
  suggestedTransform: createMockSuggestedTransform({}),
  ...overrides,
});

const setup = (payload: AgentSuggestionPayload, readonly = false) => {
  setupEnterprisePlugins();
  return renderWithProviders(
    <AgentSuggestionMessage payload={payload} readonly={readonly} />,
    {
      storeInitialState: createMockState({
        settings: mockSettings(),
        currentUser: createMockUser(),
      }),
    },
  );
};

describe("AgentSuggestionMessage", () => {
  it("should show proposal for new transforms", async () => {
    setup(
      createMockSuggestionPayload({
        editorTransform: undefined,
        suggestedTransform: createMockSuggestedTransform({
          id: undefined,
          source: {
            type: "query",
            query: createMockNativeDatasetQuery(),
          },
        }),
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
      createMockSuggestionPayload({
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

  it("should disable the action button and show a read-only tooltip when readonly", async () => {
    setup(
      createMockSuggestionPayload({
        editorTransform: undefined,
        suggestedTransform: createMockSuggestedTransform({
          id: undefined,
          source: {
            type: "query",
            query: createMockNativeDatasetQuery(),
          },
        }),
      }),
      true,
    );

    const button = await screen.findByRole("button", { name: /Create/ });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Read only");
  });

  it("should be collapsible", async () => {
    setup(
      createMockSuggestionPayload({
        editorTransform: undefined,
        suggestedTransform: createMockSuggestedTransform({
          id: undefined, // Make sure this is a new transform
          name: "Test Transform",
        }),
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
