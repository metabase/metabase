import { setupCheckSnippetDependenciesEndpoint } from "__support__/server-mocks/dependencies";
import { act, renderHookWithProviders } from "__support__/ui";
import type { CheckDependenciesResponse } from "metabase-types/api";
import {
  createMockCheckDependenciesResponse,
  createMockUpdateSnippetRequest,
} from "metabase-types/api/mocks";

import { useCheckSnippetDependencies } from "./use-check-snippet-dependencies";

type SetupOpts = {
  response?: CheckDependenciesResponse;
};

function setup({
  response = createMockCheckDependenciesResponse(),
}: SetupOpts = {}) {
  setupCheckSnippetDependenciesEndpoint(response);

  const onSave = jest.fn();
  const { result } = renderHookWithProviders(
    () => useCheckSnippetDependencies({ onSave }),
    {},
  );

  return { result, onSave };
}

describe("useCheckSnippetDependencies", () => {
  it("should save if there are no broken dependencies", async () => {
    const request = createMockUpdateSnippetRequest();
    const response = createMockCheckDependenciesResponse({ success: true });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(request));

    expect(onSave).toHaveBeenCalledWith(request);
  });

  it("should not save if there are broken dependencies", async () => {
    const request = createMockUpdateSnippetRequest();
    const response = createMockCheckDependenciesResponse({ success: false });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(request));

    expect(result.current.checkData).toEqual(response);
    expect(result.current.isConfirmationShown).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });
});
