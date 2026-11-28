import fetchMock from "fetch-mock";

import { setupGetTransformTestByEntityIdEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { skipToken } from "metabase/api";
import { createMockTransformTest } from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { useGetTransformTestQuery } from "./transform-test";

describe("useGetTransformTestQuery", () => {
  it("serves a transform test by its numeric ID without a request once it was loaded by its entity ID", async () => {
    const entityId = createMockEntityId("QGD3Qgbdvx6d3ES4aqVRV");
    const test = createMockTransformTest({
      id: 7,
      name: "Refunded orders are excluded",
      entity_id: entityId,
    });
    setupGetTransformTestByEntityIdEndpoint(test);

    const { result } = renderHookWithProviders(() => {
      const { data: loadedTest } = useGetTransformTestQuery(entityId);
      return useGetTransformTestQuery(loadedTest?.id ?? skipToken);
    }, {});

    await waitFor(() => expect(result.current.data).toEqual(test));
    expect(
      fetchMock.callHistory.calls(`path:/api/ee/transform-test/${test.id}`),
    ).toHaveLength(0);
  });
});
