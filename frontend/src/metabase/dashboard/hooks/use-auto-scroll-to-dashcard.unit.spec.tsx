import { renderHookWithProviders } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { LocationDescriptorObject } from "metabase/router";
import { createMockDashboardCard } from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { useAutoScrollToDashcard } from "./use-auto-scroll-to-dashcard";

// Pins the #scrollTo= behavior: it targets a dashcard by numeric id OR by
// entity_id (21-char NanoID). Entity ids are resolved client-side against the
// dashcards already in the store.

const DASHCARD_ID = 42;
const DASHCARD_ENTITY_ID = createMockEntityId();
const UNKNOWN_ENTITY_ID = createMockEntityId();

function setup(hash: string) {
  const location: LocationDescriptorObject = {
    pathname: "/dashboard/1",
    hash,
  };

  const storeInitialState = createMockState({
    dashboard: createMockDashboardState({
      dashcards: {
        [DASHCARD_ID]: createMockDashboardCard({
          id: DASHCARD_ID,
          entity_id: DASHCARD_ENTITY_ID,
        }),
      },
    }),
  });

  return renderHookWithProviders(() => useAutoScrollToDashcard(location), {
    storeInitialState,
  });
}

describe("useAutoScrollToDashcard", () => {
  it("targets a dashcard by its numeric id", () => {
    const { result } = setup(`#scrollTo=${DASHCARD_ID}`);
    expect(result.current.autoScrollToDashcardId).toBe(DASHCARD_ID);
  });

  it("targets a dashcard by its entity_id, resolving to the numeric id", () => {
    const { result } = setup(`#scrollTo=${DASHCARD_ENTITY_ID}`);
    expect(result.current.autoScrollToDashcardId).toBe(DASHCARD_ID);
  });

  it("targets nothing when the entity_id matches no loaded dashcard", () => {
    const { result } = setup(`#scrollTo=${UNKNOWN_ENTITY_ID}`);
    expect(result.current.autoScrollToDashcardId).toBeUndefined();
  });

  it("targets nothing when there is no scrollTo hash", () => {
    const { result } = setup("");
    expect(result.current.autoScrollToDashcardId).toBeUndefined();
  });
});
