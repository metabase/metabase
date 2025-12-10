import { setupCheckTransformDependenciesEndpoint } from "__support__/server-mocks/dependencies";
import { act, renderHookWithProviders } from "__support__/ui";
import type { CheckDependenciesResponse } from "metabase-types/api";
import {
  createMockCheckDependenciesResponse,
  createMockUpdateTransformRequest,
} from "metabase-types/api/mocks";

import { useCheckTransformDependencies } from "./use-check-transform-dependencies";

type SetupOpts = {
  response?: CheckDependenciesResponse;
};

function setup({
  response = createMockCheckDependenciesResponse(),
}: SetupOpts = {}) {
  setupCheckTransformDependenciesEndpoint(response);

  const onSave = jest.fn();
  const { result } = renderHookWithProviders(
    () => useCheckTransformDependencies({ onSave }),
    {},
  );

  return { result, onSave };
}

describe("useCheckTransformDependencies", () => {
  it("should save if there are no broken dependencies", async () => {
    const request = createMockUpdateTransformRequest();
    const response = createMockCheckDependenciesResponse({ success: true });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(request));

    expect(onSave).toHaveBeenCalledWith(request);
  });

  it("should not save if there are broken dependencies", async () => {
    const request = createMockUpdateTransformRequest();
    const response = createMockCheckDependenciesResponse({ success: false });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(request));

    expect(result.current.checkData).toEqual(response);
    expect(result.current.isConfirmationShown).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });
});
