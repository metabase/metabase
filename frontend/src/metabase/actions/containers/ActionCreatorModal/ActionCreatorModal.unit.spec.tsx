import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";

import type { Card, WritebackAction } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockCard,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";

import ActionCreatorModal from "./ActionCreatorModal";

const MODEL = createMockCard({ id: 1, dataset: true });
const MODEL_SLUG = `${MODEL.id}-${MODEL.name.toLowerCase()}`;
const ACTION = createMockQueryAction({ model_id: MODEL.id });
const ACTION_NOT_FOUND_ID = 999;
const DATABASE = createSampleDatabase({
  settings: { "database-enable-actions": true },
});

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
  setupDatabasesEndpoints([DATABASE]);
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

  return { history: checkNotNull(history) };
}

describe("actions > containers > ActionCreatorModal", () => {
  afterEach(() => {
    fetchMock.reset();
  });

  it("renders correctly", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION.id}`;
    await setup({ initialRoute });

    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-spinner"),
    );

    expect(await screen.findByTestId("action-creator")).toBeInTheDocument();
  });

  it("redirects back to the model detail page if the action is not found", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION_NOT_FOUND_ID}`;
    const { history } = await setup({ initialRoute, action: null });

    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-spinner"),
    );

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });

  it("redirects back to the model detail page if the action is archived", async () => {
    const action = { ...ACTION, archived: true };
    const initialRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
    const { history } = await setup({ initialRoute, action });

    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-spinner"),
    );

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });

  describe("creating new action", () => {
    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/action`;
      const { history } = await setup({ initialRoute, action: null });

      history.push(actionRoute);
      await waitForElementToBeRemoved(() =>
        screen.queryAllByTestId("loading-spinner"),
      );

      history.goBack();

      expect(
        screen.queryByText("Changes were not saved"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Navigating away from here will cause you to lose any changes you have made.",
        ),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/new`;
      const { history } = await setup({ initialRoute, action: null });

      history.push(actionRoute);
      await waitForElementToBeRemoved(() =>
        screen.queryAllByTestId("loading-spinner"),
      );

      const actionNameInput = screen.getByDisplayValue("New Action");
      userEvent.type(actionNameInput, "a change");
      userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      history.goBack();

      expect(screen.getByText("Changes were not saved")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Navigating away from here will cause you to lose any changes you have made.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("editing existing action", () => {
    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { history } = await setup({ initialRoute, action });

      history.push(actionRoute);
      await waitForElementToBeRemoved(() =>
        screen.queryAllByTestId("loading-spinner"),
      );

      history.goBack();

      expect(
        screen.queryByText("Changes were not saved"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "Navigating away from here will cause you to lose any changes you have made.",
        ),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { history } = await setup({ initialRoute, action });

      history.push(actionRoute);
      await waitForElementToBeRemoved(() =>
        screen.queryAllByTestId("loading-spinner"),
      );

      const actionNameInput = screen.getByDisplayValue(action.name);
      userEvent.type(actionNameInput, "a change");
      userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      history.goBack();

      expect(screen.getByText("Changes were not saved")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Navigating away from here will cause you to lose any changes you have made.",
        ),
      ).toBeInTheDocument();
    });
  });
});
