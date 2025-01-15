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
import type { UserKeyValue } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import {
  type UseUserKeyValueParams,
  useUserKeyValue,
} from "./use-user-key-value";

function setup({
  hookArgs,
}: {
  hookArgs: UseUserKeyValueParams<UserKeyValue>;
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
      setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "server-value",
      });
      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isLoading).toBe(true);
    });

    it("should return server value once loaded", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "server-value",
      });
      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });
      expect(result.current?.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("server-value");
    });

    it("should be able to set a default value", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "server-value",
      });
      const result = setup({
        hookArgs: {
          namespace: "meow",
          key: "meow",
          defaultValue: "default-value",
        },
      });
      expect(result.current.value).toBe("default-value");
      expect(result.current?.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("server-value");
    });
  });

  describe("setValue", () => {
    it("should optimistically update the value and skip refetching", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "before-value",
      });
      setupUpdateUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "after-value",
      });

      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current.setValue("after-value");
      });

      // assert optimisitic update occurred
      expect(result.current.value).toBe("after-value");
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/meow/key/meow`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current.value).toBe("after-value");
    });

    it("should revert optimisitic update if update fails", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "before-value",
      });
      fetchMock.put(`path:/api/user-key-value/namespace/meow/key/meow`, 400);

      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current.setValue("after-value");
      });

      // assert optimisitic update works as expected
      expect(result.current.value).toBe("after-value");
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/meow/key/meow`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current.value).toBe("before-value");
    });
  });

  describe("clearValue", () => {
    it("should optimistically delete a key and skip refetching its value", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "value",
      });
      setupDeleteUserKeyValueEndpoint({ namespace: "meow", key: "meow" });

      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current.clearValue();
      });

      // assert optimisitic deletion worked
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/meow/key/meow`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current.value).toBe(undefined);
    });

    it("should revert optimisitic delete if deletion fails", async () => {
      const mockedFetch = setupGetUserKeyValueEndpoint({
        namespace: "meow",
        key: "meow",
        value: "before-value",
      });
      fetchMock.delete(`path:/api/user-key-value/namespace/meow/key/meow`, 400);

      const result = setup({
        hookArgs: { namespace: "meow", key: "meow" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(mockedFetch.calls().length).toBe(1);
      act(() => {
        result.current.clearValue();
      });

      // assert optimisitic deletion was reverted
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        mockedFetch.calls(`path:/api/user-key-value/namespace/meow/key/meow`, {
          method: "GET",
        }),
      ).toHaveLength(1);
      expect(result.current.value).toBe("before-value");
    });
  });
});
