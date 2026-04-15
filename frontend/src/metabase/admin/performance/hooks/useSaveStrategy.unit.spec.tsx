import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { findRequests } from "__support__/server-mocks/util";
import { renderWithProviders } from "__support__/ui";
import type { CacheConfig, CacheStrategy } from "metabase-types/api";
import { createMockCacheConfig } from "metabase-types/api/mocks";

import { useSaveStrategy } from "./useSaveStrategy";

function setup(targetId: number, model: "question" | "metric") {
  let saveStrategy: (values: CacheStrategy) => Promise<void>;

  const TestComponent = () => {
    saveStrategy = useSaveStrategy(targetId, model);
    return null;
  };

  renderWithProviders(<TestComponent />);

  return { getSaveStrategy: () => saveStrategy! };
}

describe("useSaveStrategy", () => {
  it('should send model="question" to the API when deleting with model "question"', async () => {
    const configs: CacheConfig[] = [
      createMockCacheConfig({ model: "question", model_id: 1 }),
    ];
    setupPerformanceEndpoints(configs);

    const { getSaveStrategy } = setup(1, "question");

    await getSaveStrategy()({ type: "inherit" });

    const deleteRequests = await findRequests("DELETE");
    expect(deleteRequests).toHaveLength(1);
    expect(deleteRequests[0].body.model).toBe("question");
  });

  it('should map "metric" to "question" when deleting via the API', async () => {
    const configs: CacheConfig[] = [
      createMockCacheConfig({ model: "question", model_id: 1 }),
    ];
    setupPerformanceEndpoints(configs);

    const { getSaveStrategy } = setup(1, "metric");

    await getSaveStrategy()({ type: "inherit" });

    const deleteRequests = await findRequests("DELETE");
    expect(deleteRequests).toHaveLength(1);
    expect(deleteRequests[0].body.model).toBe("question");
  });

  it('should map "metric" to "question" when updating via the API', async () => {
    setupPerformanceEndpoints([]);

    const { getSaveStrategy } = setup(1, "metric");

    await getSaveStrategy()({
      type: "nocache",
    });

    const putRequests = await findRequests("PUT");
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0].body.model).toBe("question");
    expect(putRequests[0].body.model_id).toBe(1);
  });
});
