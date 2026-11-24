import fetchMock from "fetch-mock";

import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { GoalSourcesScopeProvider } from "metabase/visualizations/components/GoalSourcesScope";
import type {
  GoalForeignEntityRef,
  GoalSourceResults,
  GoalSourcesScope,
} from "metabase-types/api";
import { createMockGoalSourceResults } from "metabase-types/api/mocks";

import { useGoalSourceResults } from "./use-goal-source-results";

const SOURCES: GoalForeignEntityRef[] = [
  { type: "card", id: 9 },
  { type: "measure", id: 4 },
];

const RESULTS = createMockGoalSourceResults({ id: 9, value: 250 });

type SetupOpts = {
  scope?: GoalSourcesScope;
  sources?: GoalForeignEntityRef[];
};

function setup({ scope, sources = SOURCES }: SetupOpts = {}) {
  const probe = <GoalSourceResultsProbe sources={sources} />;

  renderWithProviders(
    scope != null ? (
      <GoalSourcesScopeProvider scope={scope}>{probe}</GoalSourcesScopeProvider>
    ) : (
      probe
    ),
  );
}

describe("useGoalSourceResults", () => {
  it("posts the sources for a signed-in user outside of any scope", async () => {
    setupGoalSourceResultsEndpoint(RESULTS);

    setup();

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(await getPostedBodies()).toEqual([{ sources: SOURCES }]);
  });

  it("posts the dashboard id of a signed-in dashcard scope", async () => {
    setupGoalSourceResultsEndpoint(RESULTS);

    setup({ scope: { type: "signed-in", dashboard_id: 3 } });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(await getPostedBodies()).toEqual([
      { sources: SOURCES, dashboard_id: 3 },
    ]);
  });

  it("gets the results of a public question from its goal values route", async () => {
    fetchMock.get("path:/api/public/card/public-uuid/goal-values", RESULTS);

    setup({ scope: { type: "public-card", uuid: "public-uuid" } });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });

  it("gets the results of a public dashcard from its goal values route", async () => {
    fetchMock.get(
      "path:/api/public/dashboard/public-uuid/dashcard/2/card/1/goal-values",
      RESULTS,
    );

    setup({
      scope: {
        type: "public-dashcard",
        uuid: "public-uuid",
        dashcardId: 2,
        cardId: 1,
      },
    });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });

  it("gets the results of a public document card from its goal values route", async () => {
    fetchMock.get(
      "path:/api/public/document/public-uuid/card/1/goal-values",
      RESULTS,
    );

    setup({
      scope: { type: "public-document-card", uuid: "public-uuid", cardId: 1 },
    });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });

  it("gets the results of an embedded question from its goal values route", async () => {
    fetchMock.get("path:/api/embed/card/embed-token/goal-values", RESULTS);

    setup({ scope: { type: "embed-card", token: "embed-token" } });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });

  it("gets the results of an embedded dashcard from its goal values route", async () => {
    fetchMock.get(
      "path:/api/embed/dashboard/embed-token/dashcard/2/card/1/goal-values",
      RESULTS,
    );

    setup({
      scope: {
        type: "embed-dashcard",
        token: "embed-token",
        dashcardId: 2,
        cardId: 1,
      },
    });

    expect(
      await screen.findByText(JSON.stringify(RESULTS)),
    ).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });

  it("fails every source when the request fails", async () => {
    setupGoalSourceResultsEndpoint(500);

    setup();

    const failedResults: GoalSourceResults = {
      card: { 9: { status: "failed" } },
      measure: { 4: { status: "failed" } },
    };
    expect(
      await screen.findByText(JSON.stringify(failedResults)),
    ).toBeInTheDocument();
  });

  it("has no results and sends no request without sources", () => {
    setupGoalSourceResultsEndpoint(RESULTS);

    setup({ sources: [] });

    expect(screen.getByText(JSON.stringify({}))).toBeInTheDocument();
    expect(getPostCalls()).toHaveLength(0);
  });
});

function GoalSourceResultsProbe({
  sources,
}: {
  sources: GoalForeignEntityRef[];
}) {
  const state = useGoalSourceResults(sources);

  return (
    <div>
      {state.status === "loading"
        ? "loading"
        : JSON.stringify(state.sourceResults)}
    </div>
  );
}

function getPostCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

function getPostedBodies(): Promise<unknown[]> {
  return Promise.all(
    getPostCalls().map((call): Promise<unknown> => {
      return call.request?.json() ?? Promise.resolve(undefined);
    }),
  );
}
