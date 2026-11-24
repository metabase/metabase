import userEvent from "@testing-library/user-event";

import { act, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
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

  describe("question caching form", () => {
    const card = createMockCard({ id: 12, name: "Orders" });

    const getCacheStrategySelect = () =>
      screen.getByTestId("cache-strategy-select");

    const getCachingSheet = () =>
      screen.getByRole("dialog", { name: /Caching settings/ });

    const cancelDiscarding = async () => {
      const dialog = await screen.findByRole("dialog", {
        name: "Discard your changes?",
      });
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Discard your changes?" }),
        ).not.toBeInTheDocument();
      });
      // Both sheets and the unsaved edit are still there
      expect(
        screen.getByRole("dialog", { name: "Question settings" }),
      ).toBeInTheDocument();
      expect(getCachingSheet()).toBeInTheDocument();
      expect(getCacheStrategySelect()).toHaveValue("Duration");
    };

    it("asks before discarding unsaved edits on every way of closing the form", async () => {
      const { router } = await setupEnterprise(
        { card },
        { cache_granular_controls: true },
      );
      // Give the browser history an entry to go back to
      act(() => router.navigate(`/question/${card.id}`));

      await userEvent.click(
        await screen.findByRole("button", { name: "When to get new results" }),
      );
      expect(await screen.findByText("Caching settings")).toBeInTheDocument();
      await userEvent.click(getCacheStrategySelect());
      await userEvent.click(
        await screen.findByRole("option", { name: /^Duration/ }),
      );

      // 1. The close (×) button
      await userEvent.click(
        within(getCachingSheet()).getByRole("button", { name: "Close" }),
      );
      await cancelDiscarding();

      // 2. Escape
      await userEvent.keyboard("{Escape}");
      await cancelDiscarding();

      // 3. A click outside the sheet, on its overlay. Both sheets have one:
      // the caching sheet's is the transparent one on top
      const cachingSheetOverlay = checkNotNull(
        screen
          .getAllByTestId("modal-overlay")
          .find((overlay) => overlay.style.background === "transparent"),
      );
      await userEvent.click(cachingSheetOverlay);
      await cancelDiscarding();

      // 4. The browser back button
      act(() => router.back());
      await cancelDiscarding();
      expect(router.location.pathname).toBe(`/question/${card.id}`);

      // Positive control: confirming lets the navigation through
      act(() => router.back());
      await userEvent.click(
        within(
          await screen.findByRole("dialog", { name: "Discard your changes?" }),
        ).getByRole("button", { name: "Discard" }),
      );
      await waitFor(() => expect(router.location.pathname).toBe("/"));
    });
  });

  describe("model caching", () => {
    const model = createMockCard({
      type: "model",
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
