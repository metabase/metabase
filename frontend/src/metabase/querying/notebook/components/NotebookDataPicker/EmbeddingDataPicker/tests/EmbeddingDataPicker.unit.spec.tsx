import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("EmbeddingDataPicker", () => {
  beforeEach(() => {
    setupEnterprisePlugins();
  });

  describe("multi-stage data picker", () => {
    it("should show tables when there is no models", async () => {
      setup({ hasModels: false });

      const databaseOption = await screen.findByText("Sample Database");
      expect(databaseOption).toBeInTheDocument();

      expect(screen.queryByText("Models")).not.toBeInTheDocument();
      expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();

      await userEvent.click(databaseOption);
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("People")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("Reviews")).toBeInTheDocument();
    });

    it('should show "BUCKET" step when there are both models and tables', async () => {
      setup();

      expect(await screen.findByText("Models")).toBeInTheDocument();
      const rawDataOption = screen.getByText("Raw Data");
      expect(rawDataOption).toBeInTheDocument();

      expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();

      await userEvent.click(rawDataOption);
      await userEvent.click(screen.getByText("Sample Database"));
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.getByText("People")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("Reviews")).toBeInTheDocument();
    });

    describe("entity_types", () => {
      it('should show only models when `entity_types=["models"]`', async () => {
        setup({
          entityTypes: ["model"],
        });

        expect(await screen.findByText("Models")).toBeInTheDocument();

        expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
        expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
      });

      it('should show only tables when `entity_types=["table"]`', async () => {
        setup({
          entityTypes: ["table"],
        });

        expect(await screen.findByText("Sample Database")).toBeInTheDocument();

        expect(screen.queryByText("Models")).not.toBeInTheDocument();
        expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
      });

      it('should not show "saved questions" in the database list when `entity_types=["table"]`', async () => {
        setup({
          entityTypes: ["table"],
        });

        expect(await screen.findByText("Sample Database")).toBeInTheDocument();
        expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
      });

      it('should show both models and tables when `entity_types=["models", "table"]`', async () => {
        setup({
          entityTypes: ["model", "table"],
        });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();

        expect(screen.queryByText("Sample Database")).not.toBeInTheDocument();
      });

      it("should show metrics without configuring `entity_types`", async () => {
        setup({ hasMetrics: true });

        expect(await screen.findByText("Metrics")).toBeInTheDocument();
        expect(screen.getByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();
      });

      it('should not show metrics when `entity_types=["table"]`', async () => {
        setup({
          hasMetrics: true,
          entityTypes: ["table"],
        });

        expect(await screen.findByText("Sample Database")).toBeInTheDocument();
        expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
      });

      it('should not show metrics when `entity_types=["model", "table"]`', async () => {
        setup({
          hasMetrics: true,
          entityTypes: ["model", "table"],
        });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();
        expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
      });

      it('should show metrics only when the context includes "metric"', async () => {
        setup({
          hasMetrics: true,
          contextEntityTypes: ["metric"],
        });

        expect(await screen.findByText("Metrics")).toBeInTheDocument();
        expect(screen.queryByText("Models")).not.toBeInTheDocument();
        expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
      });

      it('should not show metrics when the context leaves out "metric"', async () => {
        setup({
          hasMetrics: true,
          contextEntityTypes: ["model", "table"],
        });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();
        expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
      });

      it("should not show metrics when the instance has none", async () => {
        setup({ hasMetrics: false });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
      });

      /**
       * We don't test invalid `entityTypes` values here as the redux state is set via a slice which has proper validations and tests in place.
       *
       * @see frontend/src/metabase/redux/embed/embed.unit.spec.ts
       */
    });

    describe("the Library", () => {
      it("should show the Library in full-app embedding without configuring `entity_types`", async () => {
        setup({ hasLibrary: true });

        expect(await screen.findByText("Library")).toBeInTheDocument();
        expect(screen.getByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();
      });

      it('should not show the Library in full-app embedding when `entity_types=["table"]`', async () => {
        setup({ hasLibrary: true, entityTypes: ["table"] });

        expect(await screen.findByText("Sample Database")).toBeInTheDocument();
        expect(screen.queryByText("Library")).not.toBeInTheDocument();
      });

      it('should not show the Library in full-app embedding when `entity_types=["model", "table"]`', async () => {
        setup({ hasLibrary: true, entityTypes: ["model", "table"] });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.getByText("Raw Data")).toBeInTheDocument();
        expect(screen.queryByText("Library")).not.toBeInTheDocument();
      });

      it('should show the Library in modular embedding when `entityTypes` includes "library"', async () => {
        setup({
          hasLibrary: true,
          contextEntityTypes: ["model", "table", "library"],
        });

        expect(await screen.findByText("Library")).toBeInTheDocument();
      });

      it('should not show the Library in modular embedding when `entityTypes` leaves out "library"', async () => {
        setup({ hasLibrary: true, contextEntityTypes: ["model", "table"] });

        expect(await screen.findByText("Models")).toBeInTheDocument();
        expect(screen.queryByText("Library")).not.toBeInTheDocument();
      });
    });
  });
});
