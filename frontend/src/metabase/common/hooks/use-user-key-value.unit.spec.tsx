import { act, renderHook } from "@testing-library/react";
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
        namespace: "test",
        key: "test",
        value: "server-value",
      });
      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isLoading).toBe(true);
    });

    it("should return server value once loaded", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "server-value",
      });
      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });
      expect(result.current?.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("server-value");
    });

    it("should be able to set a default value", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "server-value",
      });
      const result = setup({
        hookArgs: {
          namespace: "test",
          key: "test",
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
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "before-value",
      });
      setupUpdateUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "after-value",
      });

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(fetchMock.callHistory.calls().length).toBe(1);
      act(() => {
        result.current.setValue("after-value");
      });

      // assert optimistic update occurred
      expect(result.current.value).toBe("after-value");
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        fetchMock.callHistory.calls(
          `path:/api/user-key-value/namespace/test/key/test`,
          {
            method: "GET",
          },
        ),
      ).toHaveLength(1);
      expect(result.current.value).toBe("after-value");
    });

    it("should revert optimistic update if update fails", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "before-value",
      });
      fetchMock.put(`path:/api/user-key-value/namespace/test/key/test`, 400);

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(fetchMock.callHistory.calls().length).toBe(1);
      act(() => {
        result.current.setValue("after-value");
      });

      // assert optimistic update works as expected
      expect(result.current.value).toBe("after-value");
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        fetchMock.callHistory.calls(
          `path:/api/user-key-value/namespace/test/key/test`,
          {
            method: "GET",
          },
        ),
      ).toHaveLength(1);
      expect(result.current.value).toBe("before-value");
    });
  });

  describe("clearValue", () => {
    it("should optimistically delete a key and skip refetching its value", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "value",
      });
      setupDeleteUserKeyValueEndpoint({ namespace: "test", key: "test" });

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("value");

      // set new value
      expect(fetchMock.callHistory.calls().length).toBe(1);
      act(() => {
        result.current.clearValue();
      });

      // assert optimistic deletion worked
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        fetchMock.callHistory.calls(
          `path:/api/user-key-value/namespace/test/key/test`,
          {
            method: "GET",
          },
        ),
      ).toHaveLength(1);
      expect(result.current.value).toBe(undefined);
    });

    it("should revert optimistic delete if deletion fails", async () => {
      setupGetUserKeyValueEndpoint({
        namespace: "test",
        key: "test",
        value: "before-value",
      });
      fetchMock.delete(`path:/api/user-key-value/namespace/test/key/test`, 400);

      const result = setup({
        hookArgs: { namespace: "test", key: "test" },
      });

      // assert initial value is correct
      await waitFor(() => {
        expect(result.current?.isLoading).toBe(false);
      });
      expect(result.current.value).toBe("before-value");

      // set new value
      expect(fetchMock.callHistory.calls().length).toBe(1);
      act(() => {
        result.current.clearValue();
      });

      // assert optimistic deletion was reverted
      expect(result.current.value).toBe(undefined);
      expect(result.current?.isMutating).toBe(true);
      await waitFor(() => {
        expect(result.current?.isMutating).toBe(false);
      });
      expect(result.current?.isLoading).toBe(false);
      expect(
        fetchMock.callHistory.calls(
          `path:/api/user-key-value/namespace/test/key/test`,
          {
            method: "GET",
          },
        ),
      ).toHaveLength(1);
      expect(result.current.value).toBe("before-value");
    });
  });
});
