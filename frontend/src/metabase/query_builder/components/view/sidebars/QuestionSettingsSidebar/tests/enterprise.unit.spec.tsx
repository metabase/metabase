import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (
  opts: SetupOpts,
  tokenFeatures: Partial<TokenFeatures>,
) => {
  return setup({
    ...opts,
    enterprisePlugins: ["caching", "model_persistence"],
    settings: createMockSettings({
      ...opts.settings,
      "token-features": createMockTokenFeatures({
        ...tokenFeatures,
      }),
    }),
  });
};

describe("QuestionSettingsSidebar", () => {
  describe("question caching", () => {
    const card = createMockCard({
      cache_ttl: 10,
      description: "abc",
    });

    it("should show caching controls with cache token feature", async () => {
      await setupEnterprise({ card }, { cache_granular_controls: true });
      expect(await screen.findByText("Caching")).toBeInTheDocument();
      expect(
        await screen.findByText("When to get new results"),
      ).toBeInTheDocument();
    });
  });

  describe("model caching", () => {
    const model = createMockCard({
      type: "model",
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      persisted: true,
      description: "abc",
    });

    it("should show caching controls with cache token feature", async () => {
      await setupEnterprise(
        { card: model },
        {
          cache_granular_controls: true,
        },
      );
      expect(await screen.findByText("Persist model data")).toBeInTheDocument();
      expect(await screen.findByLabelText("Persist model data")).toBeChecked();
    });

    it("should reflect the persisted state after toggling it without a reload (metabase#74449)", async () => {
      await setupEnterprise(
        { card: model },
        {
          cache_granular_controls: true,
        },
      );
      const toggle = await screen.findByLabelText("Persist model data");
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);
      await waitFor(() =>
        expect(screen.getByLabelText("Persist model data")).not.toBeChecked(),
      );
      expect(
        fetchMock.callHistory.calls(
          `path:/api/persist/card/${model.id}/unpersist`,
        ),
      ).toHaveLength(1);

      await userEvent.click(screen.getByLabelText("Persist model data"));
      await waitFor(() =>
        expect(screen.getByLabelText("Persist model data")).toBeChecked(),
      );
      expect(
        fetchMock.callHistory.calls(
          `path:/api/persist/card/${model.id}/persist`,
        ),
      ).toHaveLength(1);
    });

    it("should show cache status when caching is enabled", async () => {
      await setupEnterprise(
        { card: model },
        {
          cache_granular_controls: true,
        },
      );
      expect(await screen.findByText("Persist model data")).toBeInTheDocument();
      expect(await screen.findByText(/Model last cached/)).toBeInTheDocument();
    });

    it("should disable model cache toggle when DB does not support model caching", async () => {
      await setupEnterprise(
        { card: model, dbHasModelPersistence: false },
        { cache_granular_controls: true },
      );
      expect(await screen.findByText("Persist model data")).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });

    it("should show 'not supported' message when database driver doesn't support persistence", async () => {
      await setupEnterprise(
        {
          card: model,
          dbHasModelPersistence: false,
          dbSupportsModelPersistence: false,
        },
        { cache_granular_controls: true },
      );

      const toggle = await screen.findByText("Persist model data");
      expect(toggle).toHaveAttribute("data-disabled", "true");

      await userEvent.hover(toggle);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Model persistence is not supported for this database",
      );
    });

    it("should show 'disabled' message when database supports but has persistence disabled", async () => {
      await setupEnterprise(
        {
          card: model,
          dbHasModelPersistence: false,
          dbSupportsModelPersistence: true,
        },
        { cache_granular_controls: true },
      );

      const toggle = await screen.findByText("Persist model data");
      expect(toggle).toHaveAttribute("data-disabled", "true");

      await userEvent.hover(toggle);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Model persistence is disabled for this database",
      );
    });
  });
});
