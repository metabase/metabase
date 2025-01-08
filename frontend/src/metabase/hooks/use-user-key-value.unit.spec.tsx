import { act, renderHook } from "@testing-library/react-hooks";
import fetchMock from "fetch-mock";

import {
  setupDeleteUserKeyValueEndpoint,
  setupGetUserKeyValueEndpoint,
  setupUpdateUserKeyValueEndpoint,
} from "__support__/server-mocks/user-key-value";
import { waitFor } from "__support__/ui";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers as reducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { createMockState } from "metabase-types/store/mocks";

import {
  type UseUserKeyValueParams,
  useUserKeyValue,
} from "./use-user-key-value";

function setup<ValueType = any>({
  hookArgs,
}: {
  hookArgs: UseUserKeyValueParams<ValueType>;
}) {
  const store = getStore(reducers, undefined, createMockState());

  function Wrapper({ children }: any) {
    return (
      <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
    );
  }

  const { result } = renderHook(() => useUserKeyValue(hookArgs), {
    wrapper: Wrapper,
  });

  return result;
}

describe("useUserKeyValue", () => {
  describe("value", () => {
    it("should return undefined until value has loaded", async () => {
      setupGetUserKeyValueEndpoint("test", "test", "server-value");
      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });
      expect(result.current[0]).toBe(undefined);
      expect(result.current[2]?.isLoading).toBe(true);
    });

    it("should return server value once loaded", async () => {
      setupGetUserKeyValueEndpoint("test", "test", "server-value");
      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });
      expect(result.current[2]?.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("server-value");
    });

    it("should be able to set a default value", async () => {
      setupGetUserKeyValueEndpoint("test", "test", "server-value");
      const result = setup({
        hookArgs: {
          namespace: "test",
          key: "test",
          defaultValue: "default-value",
        },
      });
      expect(result.current[0]).toBe("default-value");
      expect(result.current[2]?.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("server-value");
    });
  });

  describe("setValue", () => {
    it("should optimistically update the value and skip refetching", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint(
        "test",
        "test",
        "before-value",
      );
      setupUpdateUserKeyValueEndpoint("test", "test", "after-value");

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current[1]("after-value");
      });

      // assert optimisitic update occurred
      expect(result.current[0]).toBe("after-value");
      expect(result.current[2]?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isMutating).toBe(false);
      });
      expect(result.current[2]?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/test/key/test`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current[0]).toBe("after-value");
    });

    it("should revert optimisitic update if update fails", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint(
        "test",
        "test",
        "before-value",
      );
      fetchMock.put(`path:/api/user-key-value/namespace/test/key/test`, 400);

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current[1]("after-value");
      });

      // assert optimisitic update works as expected
      expect(result.current[0]).toBe("after-value");
      expect(result.current[2]?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isMutating).toBe(false);
      });
      expect(result.current[2]?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/test/key/test`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current[0]).toBe("before-value");
    });
  });

  describe("clearValue", () => {
    it("should optimistically delete a key and skip refetching its value", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint("test", "test", "value");
      setupDeleteUserKeyValueEndpoint("test", "test");

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current[2].clearValue();
      });

      // assert optimisitic deletion worked
      expect(result.current[0]).toBe(undefined);
      expect(result.current[2]?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isMutating).toBe(false);
      });
      expect(result.current[2]?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/test/key/test`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current[0]).toBe(undefined);
    });

    it("should revert optimisitic delete if deletion fails", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint(
        "test",
        "test",
        "before-value",
      );
      fetchMock.delete(`path:/api/user-key-value/namespace/test/key/test`, 400);

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current[2]?.isLoading).toBe(false);
      });
      expect(result.current[0]).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current[2].clearValue();
      });

      // assert optimisitic deletion was reverted
      expect(result.current[0]).toBe(undefined);
      expect(result.current[2]?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current[2]?.isMutating).toBe(false);
      });
      expect(result.current[2]?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/test/key/test`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current[0]).toBe("before-value");
    });
  });
});
