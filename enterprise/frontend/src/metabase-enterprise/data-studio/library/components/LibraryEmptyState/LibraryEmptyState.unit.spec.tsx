import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import {
  setupCreateLibraryEndpoint,
  setupCreateLibraryEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { LibraryEmptyState } from "./LibraryEmptyState";

type SetupOpts = {
  section: ComponentProps<typeof LibraryEmptyState>["section"];
  hasCreateError?: boolean;
};

function setup({ section, hasCreateError }: SetupOpts) {
  if (hasCreateError) {
    setupCreateLibraryEndpointError();
  } else {
    setupCreateLibraryEndpoint();
  }

  renderWithProviders(<LibraryEmptyState section={section} />, {
    withUndos: true,
  });
}

describe("LibraryEmptyState", () => {
  describe("semantic layer section", () => {
    it("should pitch the semantic layer", () => {
      setup({ section: "semantic-layer" });

      expect(
        screen.getByText("A source of truth for analytics"),
      ).toBeInTheDocument();
      expect(screen.getByText("Create my semantic layer")).toBeInTheDocument();
    });

    it("should be able to create the library", async () => {
      setup({ section: "semantic-layer" });

      await userEvent.click(screen.getByText("Create my semantic layer"));

      expect(
        await screen.findByText("Semantic layer created"),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByText("Create my semantic layer"),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("dashboards section", () => {
    it("should pitch the library without mentioning the semantic layer", () => {
      setup({ section: "dashboards" });

      expect(
        screen.getByText("Dashboards your team can trust"),
      ).toBeInTheDocument();
      expect(screen.getByText("Create my library")).toBeInTheDocument();
      expect(
        screen.queryByText("Create my semantic layer"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("A source of truth for analytics"),
      ).not.toBeInTheDocument();
    });

    it("should be able to create the library", async () => {
      setup({ section: "dashboards" });

      await userEvent.click(screen.getByText("Create my library"));

      expect(await screen.findByText("Library created")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText("Create my library")).not.toBeInTheDocument(),
      );
    });
  });

  it("should show a library creation error", async () => {
    setup({ section: "semantic-layer", hasCreateError: true });

    await userEvent.click(screen.getByText("Create my semantic layer"));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
