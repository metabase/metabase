import { QueryStatus } from "@reduxjs/toolkit/query";
import fetchMock from "fetch-mock";

import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { Api, useLazyListTasksQuery } from "metabase/api";
import { listTag } from "metabase/api/tags";
import type { ListTasksRequest, ListTasksResponse } from "metabase-types/api";
import { createMockTask } from "metabase-types/api/mocks";

import { useAbortableQuery } from "./use-abortable-query";

const PAGE_0_TASK_ID = 1;
const PAGE_1_TASK_ID = 2;

function makeResponse(taskId: number): ListTasksResponse {
  return {
    data: [createMockTask({ id: taskId })],
    limit: 50,
    offset: 0,
    total: 2,
  };
}

function setup({
  arg = { limit: 50, offset: 0 },
  skip = false,
  refetchOnMountOrArgChange = false,
}: {
  arg?: ListTasksRequest;
  skip?: boolean;
  refetchOnMountOrArgChange?: boolean;
} = {}) {
  return renderHookWithProviders(
    ({ arg, skip }: { arg: ListTasksRequest; skip: boolean }) =>
      useAbortableQuery(useLazyListTasksQuery, arg, {
        skip,
        refetchOnMountOrArgChange,
      }),
    { initialProps: { arg, skip } },
  );
}

const getTaskCalls = () => fetchMock.callHistory.calls("path:/api/task");

const getCallsForOffset = (offset: string) =>
  getTaskCalls().filter((call) => call.url.includes(`offset=${offset}`));

describe("useAbortableQuery", () => {
  it("aborts the previous in-flight request when the arg changes and only the latest response lands", async () => {
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "0" },
      name: "page-0",
      response: makeResponse(PAGE_0_TASK_ID),
      delay: 200,
    });
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "50" },
      name: "page-1",
      response: makeResponse(PAGE_1_TASK_ID),
      delay: 10,
    });

    const { result, rerender } = setup({ arg: { limit: 50, offset: 0 } });

    const getPage0Call = () =>
      getTaskCalls().find((call) => call.url.includes("offset=0"));
    await waitFor(() => expect(getPage0Call()).toBeDefined());

    rerender({ arg: { limit: 50, offset: 50 }, skip: false });

    await waitFor(() => {
      expect(result.current.data?.data[0].id).toBe(PAGE_1_TASK_ID);
    });

    expect(getPage0Call()?.request?.signal.aborted).toBe(true);

    expect(result.current.error).toBeUndefined();
  });

  it("never surfaces the abort error", async () => {
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "0" },
      name: "page-0",
      response: makeResponse(PAGE_0_TASK_ID),
      delay: 50,
    });
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "50" },
      name: "page-1",
      response: makeResponse(PAGE_1_TASK_ID),
      delay: 300,
    });

    const { result, rerender } = setup({ arg: { limit: 50, offset: 0 } });

    const getPage0Call = () =>
      getTaskCalls().find((call) => call.url.includes("offset=0"));
    await waitFor(() => expect(getPage0Call()).toBeDefined());

    rerender({ arg: { limit: 50, offset: 50 }, skip: false });

    await waitFor(() =>
      expect(getPage0Call()?.request?.signal.aborted).toBe(true),
    );

    expect(result.current.error).toBeUndefined();
    expect(result.current.isFetching).toBe(true);

    await waitFor(() => {
      expect(result.current.data?.data[0].id).toBe(PAGE_1_TASK_ID);
    });
    expect(result.current.error).toBeUndefined();
  });

  it("does not re-trigger or abort when a referentially new but deeply-equal arg is passed, and refetch is triggered exactly once", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result, rerender } = setup({ arg: { limit: 50, offset: 0 } });

    await waitFor(() => expect(getTaskCalls()).toHaveLength(1));

    rerender({ arg: { limit: 50, offset: 0 }, skip: false });

    expect(getTaskCalls()).toHaveLength(1);
    expect(getTaskCalls()[0]?.request?.signal.aborted).toBe(false);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(getTaskCalls()).toHaveLength(2));
  });

  it("serves a cache hit without a network request by default, while refetch still hits the network", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result, rerender } = setup({ arg: { limit: 50, offset: 0 } });
    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()).toHaveLength(1);

    rerender({ arg: { limit: 50, offset: 0 }, skip: true });
    rerender({ arg: { limit: 50, offset: 0 }, skip: false });
    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()).toHaveLength(1);

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(getTaskCalls()).toHaveLength(2));
  });

  it("refetches a live cache entry when refetchOnMountOrArgChange is set", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result, rerender } = setup({
      arg: { limit: 50, offset: 0 },
      refetchOnMountOrArgChange: true,
    });
    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()).toHaveLength(1);

    rerender({ arg: { limit: 50, offset: 0 }, skip: true });
    rerender({ arg: { limit: 50, offset: 0 }, skip: false });
    await waitFor(() => expect(getTaskCalls()).toHaveLength(2));
  });

  it("aborts the in-flight request on unmount", async () => {
    fetchMock.get({
      url: "path:/api/task",
      response: makeResponse(PAGE_0_TASK_ID),
      delay: 200,
    });

    const { unmount } = setup({ arg: { limit: 50, offset: 0 } });

    const getCall = () => getTaskCalls()[0];
    await waitFor(() => expect(getCall()).toBeDefined());

    unmount();

    expect(getCall()?.request?.signal.aborted).toBe(true);
  });

  it("aborts the in-flight request when the query becomes skipped, and refetches when unskipped", async () => {
    fetchMock.get({
      url: "path:/api/task",
      response: makeResponse(PAGE_0_TASK_ID),
      delay: 200,
    });

    const { result, store, rerender } = setup({
      arg: { limit: 50, offset: 0 },
    });

    await waitFor(() => expect(getTaskCalls()).toHaveLength(1));

    rerender({ arg: { limit: 50, offset: 0 }, skip: true });
    expect(getTaskCalls()[0]?.request?.signal.aborted).toBe(true);
    expect(result.current.error).toBeUndefined();

    const hasPendingQuery = () =>
      Object.values(store.getState()[Api.reducerPath].queries).some(
        (query) => query?.status === QueryStatus.pending,
      );
    await waitFor(() => expect(hasPendingQuery()).toBe(false));

    rerender({ arg: { limit: 50, offset: 0 }, skip: false });
    await waitFor(() => expect(getTaskCalls()).toHaveLength(2));
  });

  it("issues no request while skipped", () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result } = setup({ arg: { limit: 50, offset: 0 }, skip: true });

    expect(getTaskCalls()).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("refetches the subscribed list when its tag is invalidated", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result, store } = setup({ arg: { limit: 50, offset: 0 } });

    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()).toHaveLength(1);

    act(() => {
      store.dispatch(Api.util.invalidateTags([listTag("task")]));
    });

    await waitFor(() => expect(getTaskCalls()).toHaveLength(2));
  });

  it("does not refetch a superseded arg when its tag is invalidated", async () => {
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "0" },
      name: "page-0",
      response: makeResponse(PAGE_0_TASK_ID),
    });
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "50" },
      name: "page-1",
      response: makeResponse(PAGE_1_TASK_ID),
    });

    const { result, store, rerender } = setup({
      arg: { limit: 50, offset: 0 },
    });
    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );

    rerender({ arg: { limit: 50, offset: 50 }, skip: false });
    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_1_TASK_ID),
    );

    act(() => {
      store.dispatch(Api.util.invalidateTags([listTag("task")]));
    });

    await waitFor(() => expect(getCallsForOffset("50")).toHaveLength(2));
    expect(getCallsForOffset("0")).toHaveLength(1);
  });

  it("does not refetch a skipped query when its tag is invalidated", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result, store, rerender } = setup({
      arg: { limit: 50, offset: 0 },
    });

    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()).toHaveLength(1);

    rerender({ arg: { limit: 50, offset: 0 }, skip: true });

    act(() => {
      store.dispatch(Api.util.invalidateTags([listTag("task")]));
    });

    expect(getTaskCalls()).toHaveLength(1);
  });

  it("scopes the abort to its own hook instance, leaving a co-subscriber with the same arg unaffected", async () => {
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "0" },
      name: "page-0",
      response: makeResponse(PAGE_0_TASK_ID),
      delay: 200,
    });
    fetchMock.get({
      url: "path:/api/task",
      query: { offset: "50" },
      name: "page-1",
      response: makeResponse(PAGE_1_TASK_ID),
      delay: 10,
    });

    const { result, rerender } = renderHookWithProviders(
      ({ argA, argB }: { argA: ListTasksRequest; argB: ListTasksRequest }) => ({
        a: useAbortableQuery(useLazyListTasksQuery, argA),
        b: useAbortableQuery(useLazyListTasksQuery, argB),
      }),
      {
        initialProps: {
          argA: { limit: 50, offset: 0 },
          argB: { limit: 50, offset: 0 },
        },
      },
    );

    // each instance has its own cache entry, so the identical arg is fetched twice
    await waitFor(() => expect(getCallsForOffset("0")).toHaveLength(2));

    rerender({
      argA: { limit: 50, offset: 50 },
      argB: { limit: 50, offset: 0 },
    });

    await waitFor(() => {
      expect(result.current.a.data?.data[0].id).toBe(PAGE_1_TASK_ID);
    });

    const [callA, callB] = getCallsForOffset("0");
    expect(callA?.request?.signal.aborted).toBe(true);
    expect(callB?.request?.signal.aborted).toBe(false);

    await waitFor(() => {
      expect(result.current.b.data?.data[0].id).toBe(PAGE_0_TASK_ID);
    });
    expect(result.current.b.error).toBeUndefined();
  });

  it("does not send the per-instance cache key to the server", async () => {
    fetchMock.get("path:/api/task", makeResponse(PAGE_0_TASK_ID));

    const { result } = setup({ arg: { limit: 50, offset: 0 } });

    await waitFor(() =>
      expect(result.current.data?.data[0].id).toBe(PAGE_0_TASK_ID),
    );
    expect(getTaskCalls()[0]?.url).not.toContain("rtkCacheKey");
  });

  it("surfaces real errors", async () => {
    fetchMock.get("path:/api/task", { status: 500 });

    const { result } = setup({ arg: { limit: 50, offset: 0 } });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});
