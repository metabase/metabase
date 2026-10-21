import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { renderHookWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockNativeDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";

import type { AnalysisCard } from "./analysis-card";
import { JUST_CREATED_STATE } from "./use-add-to-dashboard-toast";
import { useSaveAnalysis } from "./use-save-analysis";

const ANALYSIS_CARD: AnalysisCard = {
  name: "Funnel analysis",
  type: "question",
  display: "funnel",
  dataset_query: createMockNativeDatasetQuery(),
  visualization_settings: {},
};

type SetupOpts = {
  savedCard?: Card;
  hasUnsavedChanges?: boolean;
  canWriteToCollections?: boolean;
};

const setup = ({
  savedCard,
  hasUnsavedChanges = false,
  canWriteToCollections = true,
}: SetupOpts = {}) => {
  const onSaved = jest.fn<void, []>();
  const { result, router } = renderHookWithProviders(
    () =>
      useSaveAnalysis({
        savedCard,
        card: ANALYSIS_CARD,
        hasUnsavedChanges,
        onSaved,
      }),
    {
      withRouter: true,
      initialRoute: "/event-analysis/new/funnel",
      storeInitialState: {
        currentUser: createMockUser({
          can_write_any_collection: canWriteToCollections,
        }),
      },
    },
  );
  const getLocation = () => checkNotNull(router).location;
  return { result, onSaved, getLocation };
};

describe("useSaveAnalysis", () => {
  describe("permissions", () => {
    it("lets users who can write to a collection save a new analysis", () => {
      const { result } = setup();
      expect(result.current.canSave).toBe(true);
      expect(result.current.isSaveDisabled).toBe(false);
    });

    it("hides saving a new analysis from users who can't write to any collection", () => {
      const { result } = setup({ canWriteToCollections: false });
      expect(result.current.canSave).toBe(false);
    });

    it("lets users save a copy of an analysis they can't write to, but not rename it", () => {
      const { result } = setup({
        savedCard: createMockCard({ id: 5, can_write: false }),
        hasUnsavedChanges: true,
      });
      expect(result.current.canSave).toBe(true);
      expect(result.current.canRename).toBe(false);
    });

    it("hides saving an analysis the user can't write to or copy", () => {
      const { result } = setup({
        savedCard: createMockCard({ id: 5, can_write: false }),
        hasUnsavedChanges: true,
        canWriteToCollections: false,
      });
      expect(result.current.canSave).toBe(false);
    });

    it("hides saving an archived analysis", () => {
      const { result } = setup({
        savedCard: createMockCard({ id: 5, archived: true }),
        hasUnsavedChanges: true,
      });
      expect(result.current.canSave).toBe(false);
    });
  });

  describe("saving a saved analysis", () => {
    it("is disabled until there are unsaved changes", () => {
      const savedCard = createMockCard({ id: 5 });

      expect(setup({ savedCard }).result.current.isSaveDisabled).toBe(true);
      expect(
        setup({ savedCard, hasUnsavedChanges: true }).result.current
          .isSaveDisabled,
      ).toBe(false);
    });

    it("offers to replace the original or save a copy", () => {
      const savedCard = createMockCard({ id: 5, name: "Signups" });
      const { result } = setup({ savedCard, hasUnsavedChanges: true });

      act(() => result.current.handleSave());

      const saveModal = checkNotNull(result.current.saveModal);
      expect(saveModal.originalQuestion?.id()).toBe(5);
      expect(saveModal.question.id()).toBe(5);
      expect(saveModal.question.display()).toBe(ANALYSIS_CARD.display);
    });

    it("replaces the original with the changes, keeping its name", async () => {
      fetchMock.put("path:/api/card/5", createMockCard({ id: 5 }));
      const savedCard = createMockCard({ id: 5, name: "Signups" });
      const { result, onSaved } = setup({ savedCard, hasUnsavedChanges: true });

      act(() => result.current.handleSave());
      const { question } = checkNotNull(result.current.saveModal);
      await act(() => result.current.handleReplace(question));

      const body =
        fetchMock.callHistory.lastCall("path:/api/card/5")?.options.body;
      const request: unknown = JSON.parse(String(body));
      expect(request).toEqual({
        display: ANALYSIS_CARD.display,
        dataset_query: ANALYSIS_CARD.dataset_query,
        visualization_settings: ANALYSIS_CARD.visualization_settings,
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  describe("renaming a saved analysis", () => {
    it("updates only the name", async () => {
      fetchMock.put("path:/api/card/5", createMockCard({ id: 5 }));
      const { result } = setup({
        savedCard: createMockCard({ id: 5, name: "Signups" }),
      });

      await act(() => result.current.handleRename("Weekly signups"));

      const body =
        fetchMock.callHistory.lastCall("path:/api/card/5")?.options.body;
      const request: unknown = JSON.parse(String(body));
      expect(request).toEqual({ name: "Weekly signups" });
    });

    it("doesn't send an update when the name is unchanged", async () => {
      fetchMock.put("path:/api/card/5", createMockCard({ id: 5 }));
      const { result } = setup({
        savedCard: createMockCard({ id: 5, name: "Signups" }),
      });

      await act(() => result.current.handleRename("Signups"));

      expect(fetchMock.callHistory.calls("path:/api/card/5")).toHaveLength(0);
    });
  });

  describe("creating an analysis", () => {
    it("goes to the saved analysis and lets that navigation past the leave guard", async () => {
      setupCardCreateEndpoint();
      const { result, getLocation } = setup();
      expect(result.current.isLocationAllowed()).toBe(false);

      await act(() =>
        result.current.handleCreate(
          new Question({ ...ANALYSIS_CARD, collection_id: 3 }),
        ),
      );

      expect(getLocation().pathname).toBe("/event-analysis/1");
      expect(getLocation().state).toEqual(JUST_CREATED_STATE);
      expect(result.current.isLocationAllowed()).toBe(true);
    });

    it("goes to the dashboard it was saved into, in edit mode and scrolled to the new card", async () => {
      setupCardCreateEndpoint();
      setupDashboardEndpoints(
        createMockDashboard({
          id: 7,
          name: "Growth",
          dashcards: [createMockDashboardCard({ id: 42, card_id: 1 })],
        }),
      );
      const { result, getLocation } = setup();

      await act(() =>
        result.current.handleCreate(
          new Question({ ...ANALYSIS_CARD, dashboard_id: 7 }),
          { dashboardTabId: 9 },
        ),
      );

      const createBody =
        fetchMock.callHistory.lastCall("card-create")?.options.body;
      const createRequest: unknown = JSON.parse(String(createBody));
      expect(createRequest).toMatchObject({
        dashboard_id: 7,
        dashboard_tab_id: 9,
      });
      expect(getLocation().pathname).toBe("/dashboard/7-growth");
      expect(getLocation().search).toBe("?tab=9");
      expect(getLocation().hash).toBe("#edit&scrollTo=42");
      expect(result.current.isLocationAllowed()).toBe(true);
    });
  });
});
