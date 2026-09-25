import { renderHook } from "@testing-library/react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { getTestStoreAndWrapper, waitFor } from "__support__/ui";
import type { UserPermissions } from "metabase-types/api";
import {
  createMockDatabase,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { useNewQuestionOptions } from "./use-new-question-options";

const setup = (permissions: UserPermissions) => {
  setupDatabasesEndpoints([createMockDatabase()]);

  const { wrapper } = getTestStoreAndWrapper({
    initialRoute: "/",
    storeInitialState: createMockState({
      currentUser: createMockUser({
        permissions: createMockUserPermissions(permissions),
      }),
    }),
  });

  return renderHook(() => useNewQuestionOptions(), { wrapper });
};

const getOptionValues = (result: {
  current: ReturnType<typeof useNewQuestionOptions>;
}) => result.current.map(({ value }) => value);

describe("useNewQuestionOptions", () => {
  it("offers notebook and native questions to users who can create both", async () => {
    const { result } = setup({
      can_create_queries: true,
      can_create_native_queries: true,
    });

    await waitFor(() =>
      expect(getOptionValues(result)).toEqual(["notebook", "native"]),
    );
    expect(result.current.map(({ label }) => label)).toEqual([
      "New Question",
      "New SQL query",
    ]);
  });

  it("offers only notebook questions to users without native query permissions", async () => {
    const { result } = setup({
      can_create_queries: true,
      can_create_native_queries: false,
    });

    await waitFor(() => expect(getOptionValues(result)).toEqual(["notebook"]));
  });

  it("offers no new question options to users without query permissions", async () => {
    const { result } = setup({
      can_create_queries: false,
      can_create_native_queries: false,
    });

    await waitFor(() => expect(getOptionValues(result)).toEqual([]));
  });
});
