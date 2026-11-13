import { act, renderHook } from "@testing-library/react";

import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { useSegmentDrafts } from "./use-segment-drafts";

const EVENT_TABLE_ID = 1;
const PEOPLE_TABLE_ID = 2;

const QUERY = Lib.toJsQuery(
  Lib.queryFromTableOrCardMetadata(
    SAMPLE_PROVIDER,
    checkNotNull(Lib.tableOrCardMetadata(SAMPLE_PROVIDER, ORDERS_ID)),
  ),
);

const draft = (name: string) => ({ name, query: QUERY });

const getNames = (result: { current: ReturnType<typeof useSegmentDrafts> }) =>
  result.current.drafts.map(({ name }) => name);

describe("useSegmentDrafts", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("keeps drafts made on two tables at once for a later reader", () => {
    const { result: events } = renderHook(() =>
      useSegmentDrafts(EVENT_TABLE_ID),
    );
    const { result: people } = renderHook(() =>
      useSegmentDrafts(PEOPLE_TABLE_ID),
    );

    act(() => people.current.addDraft(draft("Paying")));
    act(() => events.current.addDraft(draft("Signed up")));
    act(() => people.current.addDraft(draft("Churned")));

    const { result: laterPeople } = renderHook(() =>
      useSegmentDrafts(PEOPLE_TABLE_ID),
    );
    const { result: laterEvents } = renderHook(() =>
      useSegmentDrafts(EVENT_TABLE_ID),
    );
    expect(getNames(laterPeople)).toEqual(["Paying", "Churned"]);
    expect(getNames(laterEvents)).toEqual(["Signed up"]);
  });

  it("shows a draft to every reader of its table as soon as it's made", () => {
    const { result: panel } = renderHook(() =>
      useSegmentDrafts(PEOPLE_TABLE_ID),
    );
    const { result: picker } = renderHook(() =>
      useSegmentDrafts(PEOPLE_TABLE_ID),
    );

    act(() => panel.current.addDraft(draft("Paying")));
    expect(getNames(picker)).toEqual(["Paying"]);

    const [paying] = panel.current.drafts;
    act(() => panel.current.removeDraft(paying.id));
    expect(getNames(picker)).toEqual([]);
  });

  it("reads the drafts the session already has, as after a reload", () => {
    window.sessionStorage.setItem(
      "metabase.product-analytics.segment-drafts",
      JSON.stringify({
        [EVENT_TABLE_ID]: [{ id: "draft-1", ...draft("Signed up") }],
        [PEOPLE_TABLE_ID]: [{ id: "not-a-draft" }],
      }),
    );

    const { result: events } = renderHook(() =>
      useSegmentDrafts(EVENT_TABLE_ID),
    );
    const { result: people } = renderHook(() =>
      useSegmentDrafts(PEOPLE_TABLE_ID),
    );
    expect(getNames(events)).toEqual(["Signed up"]);
    expect(getNames(people)).toEqual([]);
  });
});
