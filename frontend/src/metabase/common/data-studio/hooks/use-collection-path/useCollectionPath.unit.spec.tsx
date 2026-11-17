import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { CollectionId } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { useCollectionPath } from "./useCollectionPath";

const LIBRARY = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});
const SALES = createMockCollection({
  id: 3,
  name: "Sales",
  effective_ancestors: [LIBRARY],
});
const EXAMPLES = createMockCollection({ id: 5, name: "Examples" });

function setup(collectionId: CollectionId) {
  setupCollectionByIdEndpoint({ collections: [LIBRARY, SALES, EXAMPLES] });

  return renderHookWithProviders(
    ({ collectionId }: { collectionId: CollectionId }) =>
      useCollectionPath({ collectionId }),
    { initialProps: { collectionId } },
  );
}

describe("useCollectionPath", () => {
  it("loads the collection and its ancestors", async () => {
    const { result } = setup(SALES.id);

    expect(result.current).toEqual({ isLoadingPath: true, path: null });
    await waitFor(() => expect(result.current.isLoadingPath).toBe(false));
    expect(result.current.path?.map((c) => c.name)).toEqual([
      "Library",
      "Sales",
    ]);
  });

  it("is loading again, with no stale path, while a new collection loads", async () => {
    const { result, rerender } = setup(SALES.id);
    await waitFor(() => expect(result.current.isLoadingPath).toBe(false));

    rerender({ collectionId: EXAMPLES.id });

    expect(result.current).toEqual({ isLoadingPath: true, path: null });
    await waitFor(() => expect(result.current.isLoadingPath).toBe(false));
    expect(result.current.path?.map((c) => c.name)).toEqual(["Examples"]);
  });
});
