import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { GoalData } from "metabase/viz-core";
import type {
  GoalValue,
  ReferencedEntitiesResults,
  ReferencedEntity,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockFailedReferencedEntitiesResults,
} from "metabase-types/api/mocks";

import { useAnsweredGoalValue } from "./use-answered-goal-value";

const DATA: GoalData = {
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
};

const CARD_REF: GoalValue = { type: "card", id: 9, column: "goal" };

const RESOLVING = { value: null, isUnanswered: true };

interface SetupOpts {
  data?: GoalData;
  referencedEntities?: ReferencedEntity[];
  value: GoalValue | null | undefined;
}

function setup({ data = DATA, referencedEntities, value }: SetupOpts) {
  return renderHookWithProviders(
    () => useAnsweredGoalValue({ data, referencedEntities, value }),
    {},
  );
}

describe("useAnsweredGoalValue", () => {
  it("resolves a static number without fetching", () => {
    const { result } = setup({ value: 100 });

    expect(result.current).toEqual({ value: 100 });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("resolves an unset goal to null", () => {
    expect(setup({ value: null }).result.current).toEqual({ value: null });
    expect(setup({ value: undefined }).result.current).toEqual({
      value: null,
    });
  });

  it("resolves a self column from the first row", () => {
    expect(setup({ value: "count" }).result.current).toEqual({ value: 50 });
  });

  it("fails for a self column that does not exist", () => {
    expect(setup({ value: "missing" }).result.current).toEqual({
      value: null,
      error: { column: "missing", reason: "column-not-found" },
    });
  });

  it("resolves a foreign reference the data already answers", () => {
    const data: GoalData = {
      ...DATA,
      referenced_entities: createCardValues(["goal"], [250]),
    };

    expect(setup({ data, value: CARD_REF }).result.current).toEqual({
      value: 250,
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("answers a foreign reference by fetching the values of its source", async () => {
    setupGoalValuesEndpoint(createCardValues(["goal"], [250]));

    const { result } = setup({ value: CARD_REF });
    expect(result.current).toEqual(RESOLVING);

    await waitFor(() => expect(result.current).toEqual({ value: 250 }));
    expect(await getLastRequestBody()).toEqual({
      sources: [{ type: "card", id: 9 }],
    });
  });

  it("fetches the values of the given entities instead of only the referenced one", async () => {
    setupGoalValuesEndpoint(createCardValues(["goal"], [250]));

    const { result } = setup({
      referencedEntities: [
        { type: "card", id: 9 },
        { type: "measure", id: 4 },
      ],
      value: CARD_REF,
    });

    await waitFor(() => expect(result.current).toEqual({ value: 250 }));
    expect(await getLastRequestBody()).toEqual({
      sources: [
        { type: "card", id: 9 },
        { type: "measure", id: 4 },
      ],
    });
  });

  it.each<{ name: string; referencedEntities: ReferencedEntity[] }>([
    { name: "no entities", referencedEntities: [] },
    {
      name: "only other entities",
      referencedEntities: [{ type: "measure", id: 4 }],
    },
  ])(
    "fetches only the referenced entity when given $name",
    async ({ referencedEntities }) => {
      setupGoalValuesEndpoint(createCardValues(["goal"], [250]));

      const { result } = setup({ referencedEntities, value: CARD_REF });

      await waitFor(() => expect(result.current).toEqual({ value: 250 }));
      expect(await getLastRequestBody()).toEqual({
        sources: [{ type: "card", id: 9 }],
      });
    },
  );

  it("fails when the fresh values lack the referenced column", async () => {
    setupGoalValuesEndpoint(createCardValues(["other"], [1]));

    const { result } = setup({ value: CARD_REF });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        value: null,
        error: { ...CARD_REF, reason: "column-not-found" },
      }),
    );
  });

  it("fails when the fresh values lack the referenced source", async () => {
    setupGoalValuesEndpoint({});

    const { result } = setup({ value: CARD_REF });

    await waitFor(() =>
      expect(result.current).toEqual({
        value: null,
        error: {
          ...CARD_REF,
          reason: "query-failed",
          message: "Couldn't load this value",
        },
      }),
    );
  });

  it("fails when the referenced value is not a number", async () => {
    setupGoalValuesEndpoint(createCardValues(["goal"], ["nope"]));

    const { result } = setup({ value: CARD_REF });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        value: null,
        error: { ...CARD_REF, reason: "not-a-number" },
      }),
    );
  });

  it("fails without fetching when the data reports a failed reference", () => {
    const data: GoalData = {
      ...DATA,
      referenced_entities: createMockFailedReferencedEntitiesResults({
        error: "boom",
      }),
    };

    expect(setup({ data, value: CARD_REF }).result.current).toEqual({
      value: null,
      error: { ...CARD_REF, reason: "query-failed", message: "boom" },
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  it("fails when fetching the values fails", async () => {
    setupGoalValuesEndpoint(() => new Response(null, { status: 500 }));

    const { result } = setup({ value: CARD_REF });

    await waitFor(() =>
      expect(result.current).toEqual({
        value: null,
        error: {
          ...CARD_REF,
          reason: "query-failed",
          message: "Couldn't load this value",
        },
      }),
    );
  });

  it("keeps the data's column-not-found error when fetching the values fails", async () => {
    setupGoalValuesEndpoint(() => new Response(null, { status: 500 }));
    const data: GoalData = {
      ...DATA,
      referenced_entities: createCardValues(["other"], [1]),
    };

    const { result } = setup({ data, value: CARD_REF });
    expect(result.current).toEqual(RESOLVING);

    await waitFor(() =>
      expect(result.current).toMatchObject({
        value: null,
        error: { ...CARD_REF, reason: "column-not-found" },
      }),
    );
    expect(getGoalValuesCalls()).toHaveLength(1);
  });
});

function createCardValues(
  cols: string[],
  row: (number | string)[],
): ReferencedEntitiesResults {
  return {
    card: {
      9: {
        status: "completed",
        data: {
          cols: cols.map((name) => createMockColumn({ name })),
          rows: [row],
        },
      },
    },
  };
}

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

async function getLastRequestBody(): Promise<unknown> {
  const call = fetchMock.callHistory.lastCall("path:/api/dynamic-goal/values");
  return checkNotNull(call?.request).json();
}
