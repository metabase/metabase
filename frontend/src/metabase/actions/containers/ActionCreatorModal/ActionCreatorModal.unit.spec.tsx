import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  act,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Card, WritebackAction } from "metabase-types/api";
import {
  createMockCard,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import ActionCreatorModal from "./ActionCreatorModal";

const MODEL = createMockCard({ id: 1, type: "model" });
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
        component={routeProps => (
          <ActionCreatorModal
            {...routeProps}
            onClose={() => history?.push(`/model/${MODEL.id}/detail/actions`)}
          />
        )}
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

  await waitForLoaderToBeRemoved();

  return { history: checkNotNull(history) };
}

describe("actions > containers > ActionCreatorModal", () => {
  afterEach(() => {
    fetchMock.reset();
  });

  it("renders correctly", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION.id}`;
    await setup({ initialRoute });

    await waitFor(() => {
      expect(screen.getByTestId("action-creator")).toBeInTheDocument();
    });
  });

  it("redirects back to the model detail page if the action is not found", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION_NOT_FOUND_ID}`;
    const { history } = await setup({ initialRoute, action: null });

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

      act(() => {
        history.push(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      act(() => {
        history.goBack();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/new`;
      const { history } = await setup({ initialRoute, action: null });

      act(() => {
        history.push(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByDisplayValue("New Action"), "a change");
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag

      act(() => {
        history.goBack();
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when saving changes", async () => {
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/new`;
      const { history } = await setup({ initialRoute, action: null });

      act(() => {
        history.push(actionRoute);
      });

      expect(await screen.findByTestId("action-creator")).toBeInTheDocument();

      const query = "select 1;";

      await userEvent.type(screen.getByDisplayValue("New Action"), "a change");
      await userEvent.type(screen.queryAllByRole("textbox")[1], query);
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag

      fetchMock.post("path:/api/action", {
        name: "New Actiona change",
        dataset_query: {
          type: "native",
          database: DATABASE.id,
          native: {
            query,
            "template-tags": {},
          },
        },
        database_id: DATABASE.id,
        parameters: [],
        type: "query",
        visualization_settings: {
          name: "",
          type: "button",
          description: "",
          confirmMessage: "",
          successMessage: "",
          fields: {},
        },
      });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(history.getCurrentLocation().pathname).toBe(initialRoute);
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing existing action", () => {
    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { history } = await setup({ initialRoute, action });

      act(() => {
        history.push(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      const input = screen.getByDisplayValue(action.name);
      await userEvent.type(input, "12");
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag
      await userEvent.type(input, "{backspace}{backspace}");
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag

      act(() => {
        history.goBack();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { history } = await setup({ initialRoute, action });

      act(() => {
        history.push(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByDisplayValue(action.name), "a change");
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag

      act(() => {
        history.goBack();
      });

      expect(
        await screen.findByTestId("leave-confirmation"),
      ).toBeInTheDocument();
    });

    it("does not show custom warning modal when saving changes", async () => {
      const action = ACTION;

      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { history } = await setup({ initialRoute, action });

      act(() => {
        history.push(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByDisplayValue(action.name), "a change");
      await userEvent.tab(); // need to click away from the input to re-compute the isDirty flag

      fetchMock.put(
        `path:/api/action/${action.id}`,
        {
          ...action,
          name: `${action.name}a change`,
        },
        { overwriteRoutes: true },
      );

      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(history.getCurrentLocation().pathname).toBe(initialRoute);
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
