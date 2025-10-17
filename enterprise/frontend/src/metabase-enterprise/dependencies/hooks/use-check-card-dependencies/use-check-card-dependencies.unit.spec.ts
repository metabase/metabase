import {
  setupCheckCardDependenciesEndpoint,
  setupCheckCardDependenciesEndpointError,
} from "__support__/server-mocks/dependencies";
import { act, renderHookWithProviders } from "__support__/ui";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { CheckDependenciesResponse } from "metabase-types/api";
import { createMockCheckDependenciesResponse } from "metabase-types/api/mocks";

import { useCheckCardDependencies } from "./use-check-card-dependencies";

type SetupOpts = {
  response?: CheckDependenciesResponse;
  hasError?: boolean;
};

function setup({
  response = createMockCheckDependenciesResponse(),
  hasError = false,
}: SetupOpts = {}) {
  if (hasError) {
    setupCheckCardDependenciesEndpointError();
  } else {
    setupCheckCardDependenciesEndpoint(response);
  }

  const onSave = jest.fn();
  const { result } = renderHookWithProviders(
    () => useCheckCardDependencies({ onSave }),
    {},
  );

  return { result, onSave };
}

describe("useCheckCardDependencies", () => {
  it("should save if there are no broken dependencies", async () => {
    const question = Question.create({ metadata: SAMPLE_METADATA });
    const response = createMockCheckDependenciesResponse({ success: true });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(question));

    expect(onSave).toHaveBeenCalledWith(question);
  });

  it("should not save if there are broken dependencies", async () => {
    const question = Question.create({ metadata: SAMPLE_METADATA });
    const response = createMockCheckDependenciesResponse({ success: false });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(question));

    expect(result.current.checkData).toEqual(response);
    expect(result.current.isConfirmationShown).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("should allow to confirm saving", async () => {
    const question = Question.create({ metadata: SAMPLE_METADATA });
    const response = createMockCheckDependenciesResponse({ success: false });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(question));
    await act(() => result.current.handleSaveAfterConfirmation());

    expect(result.current.checkData).toEqual(response);
    expect(result.current.isConfirmationShown).toBe(false);
    expect(onSave).toHaveBeenCalledWith(question);
  });

  it("should allow to cancel the confirmation screen", async () => {
    const question = Question.create({ metadata: SAMPLE_METADATA });
    const response = createMockCheckDependenciesResponse({ success: false });
    const { result, onSave } = setup({ response });

    await act(() => result.current.handleInitialSave(question));
    await act(() => result.current.handleCloseConfirmation());

    expect(result.current.checkData).toEqual(response);
    expect(result.current.isConfirmationShown).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("should save if there is a backend error when checking dependencies", async () => {
    const question = Question.create({ metadata: SAMPLE_METADATA });
    const { result, onSave } = setup({ hasError: true });

    await act(() => result.current.handleInitialSave(question));

    expect(onSave).toHaveBeenCalledWith(question);
  });
});
