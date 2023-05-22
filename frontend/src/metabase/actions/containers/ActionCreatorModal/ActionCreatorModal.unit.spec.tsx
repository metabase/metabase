import React from "react";
import { Route } from "react-router";
import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupModelActionsEndpoints,
  setupCardsEndpoints,
} from "__support__/server-mocks";

import type { Card, WritebackAction } from "metabase-types/api";
import {
  createMockCard,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import ActionCreatorModal from "./ActionCreatorModal";

jest.mock(
  "metabase/actions/containers/ActionCreator",
  () =>
    function MockActionCreator() {
      return <div data-testid="mock-action-creator" />;
    },
);

const MODEL = createMockCard({ id: 1, dataset: true });
const MODEL_SLUG = `${MODEL.id}-${MODEL.name.toLowerCase()}`;
const ACTION = createMockQueryAction({ model_id: MODEL.id });
const ACTION_NOT_FOUND_ID = 999;

type SetupOpts = {
  initialRoute: string;
  action?: WritebackAction | null;
  model?: Card;
};

async function setup({
  initialRoute,
  model = MODEL,
  action = ACTION,
}: SetupOpts) {
  setupCardsEndpoints([model]);

  if (action) {
    setupModelActionsEndpoints([action], model.id);
  } else {
    fetchMock.get(`path:/api/action/${ACTION_NOT_FOUND_ID}`, 404);
  }

  const { history } = renderWithProviders(
    <>
      <Route
        path="/model/:slug/detail/actions/:actionId"
        component={ActionCreatorModal}
      />
      <Route
        path="/model/:slug/detail/actions"
        component={() => <div data-testid="mock-model-detail" />}
      />
    </>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));

  return { history };
}

describe("actions > containers > ActionCreatorModal", () => {
  afterEach(() => {
    fetchMock.reset();
  });

  it("renders correctly", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION.id}`;
    await setup({ initialRoute });
    expect(
      await screen.findByTestId("mock-action-creator"),
    ).toBeInTheDocument();
  });

  it("redirects back to the model detail page if the action is not found", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION_NOT_FOUND_ID}`;
    const { history } = await setup({ initialRoute, action: null });

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-action-creator")).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });

  it("redirects back to the model detail page if the action is archived", async () => {
    const action = { ...ACTION, archived: true };
    const initialRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
    const { history } = await setup({ initialRoute, action });

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-action-creator")).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });
});
