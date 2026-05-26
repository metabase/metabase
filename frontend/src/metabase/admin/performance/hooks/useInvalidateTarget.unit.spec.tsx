import fetchMock from "fetch-mock";

import { act, renderWithProviders } from "__support__/ui";
import type { CacheableModel } from "metabase-types/api";

import { useInvalidateTarget } from "./useInvalidateTarget";

function setup(targetId: number, targetModel: CacheableModel) {
  let invalidateTarget: () => Promise<void>;

  const TestComponent = () => {
    invalidateTarget = useInvalidateTarget(targetId, targetModel, {
      smooth: false,
    });
    return null;
  };

  fetchMock.post("glob:*/api/cache/invalidate*", {});

  renderWithProviders(<TestComponent />);

  return { getInvalidateTarget: () => invalidateTarget! };
}

function getInvalidateRequestUrl(): URL {
  const calls = fetchMock.callHistory.calls();
  const invalidateCall = calls.find((call) =>
    call.url?.includes("/api/cache/invalidate"),
  );
  return new URL(invalidateCall!.url!);
}

describe("useInvalidateTarget", () => {
  it('should send "question" as the query param when model is "question"', async () => {
    const { getInvalidateTarget } = setup(1, "question");

    // Invoking the callback triggers an RTK Query mutation whose state
    // updates must stay wrapped in act.
    await act(async () => {
      await getInvalidateTarget()();
    });

    const url = getInvalidateRequestUrl();
    expect(url.searchParams.get("question")).toBe("1");
    expect(url.searchParams.has("metric")).toBe(false);
  });

  it('should map "metric" to "question" in the query param', async () => {
    const { getInvalidateTarget } = setup(1, "metric");

    // Invoking the callback triggers an RTK Query mutation whose state
    // updates must stay wrapped in act.
    await act(async () => {
      await getInvalidateTarget()();
    });

    const url = getInvalidateRequestUrl();
    expect(url.searchParams.get("question")).toBe("1");
    expect(url.searchParams.has("metric")).toBe(false);
  });
});
