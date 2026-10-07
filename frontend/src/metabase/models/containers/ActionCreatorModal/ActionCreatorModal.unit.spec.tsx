import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  getDefaultFieldSettings,
  getDefaultFormSettings,
} from "metabase/actions/utils";
import { Route, useLocation, useParams } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { Card, WritebackAction } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockCard,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import ActionCreatorModal from "./ActionCreatorModal";

/** Feeds the modal its route props the way `modalRoute` does in the app. */
function RoutedActionCreatorModal({ onClose }: { onClose: () => void }) {
  const params = useParams<{ slug: string; actionId: string }>();
  const location = useLocation();
  return (
    <ActionCreatorModal params={params} location={location} onClose={onClose} />
  );
}

const MODEL = createMockCard({ id: 1, type: "model" });
const MODEL_SLUG = `${MODEL.id}-${MODEL.name.toLowerCase()}`;
const ACTION = createMockImplicitQueryAction({
  model_id: MODEL.id,
  parameters: [createMockActionParameter({ id: "name", name: "Name" })],
  visualization_settings: getDefaultFormSettings({
    fields: { name: getDefaultFieldSettings({ id: "name" }) },
  }),
});
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

  const { router } = renderWithProviders(
    <>
      <Route
        path="/model/:slug/detail/actions/:actionId"
        element={
          <RoutedActionCreatorModal
            onClose={() =>
              router?.navigate(`/model/${MODEL.id}/detail/actions`)
            }
          />
        }
      />
      <Route
        path="/model/:slug/detail/actions"
        element={<div data-testid="mock-model-detail" />}
      />
    </>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForLoaderToBeRemoved();

  return { router: checkNotNull(router) };
}

describe("actions > containers > ActionCreatorModal", () => {
  it("renders correctly", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION.id}`;
    await setup({ initialRoute });

    await waitFor(() => {
      expect(screen.getByTestId("action-creator")).toBeInTheDocument();
    });
  });

  it("redirects back to the model detail page if the action is not found", async () => {
    const initialRoute = `/model/${MODEL.id}/detail/actions/${ACTION_NOT_FOUND_ID}`;
    const { router } = await setup({ initialRoute, action: null });

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    expect(router.location.pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });

  it("redirects back to the model detail page if the action is archived", async () => {
    const action = { ...ACTION, archived: true };
    const initialRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
    const { router } = await setup({ initialRoute, action });

    expect(await screen.findByTestId("mock-model-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
    expect(router.location.pathname).toBe(
      `/model/${MODEL_SLUG}/detail/actions`,
    );
  });

  describe("editing existing action", () => {
    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { router } = await setup({ initialRoute, action });

      act(() => {
        router.navigate(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      const showFieldCheckbox = await screen.findByLabelText("Show field");
      await userEvent.click(showFieldCheckbox);
      await userEvent.click(showFieldCheckbox);

      act(() => {
        router.back();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const action = ACTION;
      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { router } = await setup({ initialRoute, action });

      act(() => {
        router.navigate(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      await userEvent.click(await screen.findByLabelText("Show field"));

      act(() => {
        router.back();
      });

      expect(
        await screen.findByTestId("leave-confirmation"),
      ).toBeInTheDocument();
    });

    it("does not show custom warning modal when saving changes", async () => {
      const action = ACTION;

      const initialRoute = `/model/${MODEL.id}/detail/actions`;
      const actionRoute = `/model/${MODEL.id}/detail/actions/${action.id}`;
      const { router } = await setup({ initialRoute, action });

      act(() => {
        router.navigate(actionRoute);
      });

      await waitFor(() => {
        expect(screen.getByTestId("action-creator")).toBeInTheDocument();
      });

      await userEvent.click(await screen.findByLabelText("Show field"));

      fetchMock.modifyRoute(`action-${action.id}-put`, { response: action });

      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(router.location.pathname).toBe(initialRoute);
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
