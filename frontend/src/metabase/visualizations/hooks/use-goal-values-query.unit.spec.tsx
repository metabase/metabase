import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { checkNotNull } from "metabase/utils/types";
import {
  type GoalValuesScope,
  GoalValuesScopeProvider,
} from "metabase/visualizations/components/GoalValuesScope";
import type { ReferencedEntity } from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import { createMockReferencedEntitiesResults } from "metabase-types/api/mocks";

import { useGoalValuesQuery } from "./use-goal-values-query";

const MEASURE: ReferencedEntity = { type: "measure", id: 4 };
const FIRST_CARD: ReferencedEntity = { type: "card", id: 9 };
const SECOND_CARD: ReferencedEntity = { type: "card", id: 12 };

const CARD_SCOPE: GoalValuesScope = { type: "card" };
const DASHCARD_SCOPE: GoalValuesScope = {
  type: "dashcard",
  dashboardId: 1,
  dashcardId: 2,
};
const DOCUMENT_CARD_SCOPE: GoalValuesScope = {
  type: "document-card",
  cardId: 3,
};

const UUID = "public-uuid";
const TOKEN = "embed-token";

interface SetupOpts {
  entities?: ReferencedEntity[];
  scope?: GoalValuesScope;
  token?: EntityToken | null;
  uuid?: EntityUuid | null;
}

function setup({
  entities = [SECOND_CARD, MEASURE, FIRST_CARD],
  scope = CARD_SCOPE,
  token = null,
  uuid = null,
}: SetupOpts = {}) {
  setupGoalValuesEndpoint(createMockReferencedEntitiesResults());

  const { rerender } = renderWithProviders(
    <GoalValuesQueryTester
      entities={entities}
      scope={scope}
      token={token}
      uuid={uuid}
    />,
  );

  function rerenderWithEntities(newEntities: ReferencedEntity[]) {
    rerender(
      <GoalValuesQueryTester
        entities={newEntities}
        scope={scope}
        token={token}
        uuid={uuid}
      />,
    );
  }

  return { rerenderWithEntities };
}

interface GoalValuesQueryTesterProps {
  entities: ReferencedEntity[];
  scope: GoalValuesScope;
  token: EntityToken | null;
  uuid: EntityUuid | null;
}

function GoalValuesQueryTester({
  entities,
  scope,
  token,
  uuid,
}: GoalValuesQueryTesterProps) {
  return (
    <EmbeddingEntityContextProvider token={token} uuid={uuid}>
      <GoalValuesScopeProvider scope={scope}>
        <GoalValuesQueryStatus entities={entities} />
      </GoalValuesScopeProvider>
    </EmbeddingEntityContextProvider>
  );
}

function GoalValuesQueryStatus({ entities }: { entities: ReferencedEntity[] }) {
  const { isSuccess } = useGoalValuesQuery(entities);

  return <div>{isSuccess ? "loaded" : "not loaded"}</div>;
}

describe("useGoalValuesQuery", () => {
  describe("for a signed-in user", () => {
    it("asks for the sources in a stable order", async () => {
      setup();

      await waitFor(() => expect(getGoalValuesCalls()).toHaveLength(1));
      expect(await getRequestBody(0)).toEqual({
        sources: [FIRST_CARD, SECOND_CARD, MEASURE],
      });
    });

    it("sends the dashboard of a dashcard along", async () => {
      setup({ scope: DASHCARD_SCOPE });

      await waitFor(() => expect(getGoalValuesCalls()).toHaveLength(1));
      expect(await getRequestBody(0)).toEqual({
        sources: [FIRST_CARD, SECOND_CARD, MEASURE],
        dashboard_id: 1,
      });
    });

    it("reuses the request for the same entities in another order", async () => {
      const { rerenderWithEntities } = setup();
      expect(await screen.findByText("loaded")).toBeInTheDocument();

      rerenderWithEntities([MEASURE, FIRST_CARD, SECOND_CARD]);
      await waitForPendingRequests();

      expect(screen.getByText("loaded")).toBeInTheDocument();
      expect(getGoalValuesCalls()).toHaveLength(1);
    });

    it("asks for nothing without entities", async () => {
      setup({ entities: [] });
      await waitForPendingRequests();

      expect(getGoalValuesCalls()).toHaveLength(0);
    });
  });

  describe("for a public or embedded chart", () => {
    it.each([
      {
        name: "a public question",
        scope: CARD_SCOPE,
        uuid: UUID,
        url: `/api/public/card/${UUID}/goal-values`,
      },
      {
        name: "a public dashboard card",
        scope: DASHCARD_SCOPE,
        uuid: UUID,
        url: `/api/public/dashboard/${UUID}/dashcard/2/goal-values`,
      },
      {
        name: "a public document card",
        scope: DOCUMENT_CARD_SCOPE,
        uuid: UUID,
        url: `/api/public/document/${UUID}/card/3/goal-values`,
      },
      {
        name: "an embedded question",
        scope: CARD_SCOPE,
        token: TOKEN,
        url: `/api/embed/card/${TOKEN}/goal-values`,
      },
      {
        name: "an embedded dashboard card",
        scope: DASHCARD_SCOPE,
        token: TOKEN,
        url: `/api/embed/dashboard/${TOKEN}/dashcard/2/goal-values`,
      },
    ])("asks the endpoint of $name", async ({ scope, token, uuid, url }) => {
      fetchMock.get(`path:${url}`, createMockReferencedEntitiesResults());

      setup({ scope, token, uuid });

      expect(await screen.findByText("loaded")).toBeInTheDocument();
      expect(fetchMock.callHistory.calls(`path:${url}`)).toHaveLength(1);
      expect(getGoalValuesCalls()).toHaveLength(0);
    });

    it("asks for nothing without entities", async () => {
      fetchMock.get(
        `path:/api/public/card/${UUID}/goal-values`,
        createMockReferencedEntitiesResults(),
        { name: "public-card-goal-values" },
      );

      setup({ entities: [], uuid: UUID });
      await waitForPendingRequests();

      expect(
        fetchMock.callHistory.calls("public-card-goal-values"),
      ).toHaveLength(0);
    });
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

async function getRequestBody(callIndex: number): Promise<unknown> {
  return checkNotNull(getGoalValuesCalls()[callIndex].request).json();
}

// gives a request, if any, the chance to start
async function waitForPendingRequests() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}
