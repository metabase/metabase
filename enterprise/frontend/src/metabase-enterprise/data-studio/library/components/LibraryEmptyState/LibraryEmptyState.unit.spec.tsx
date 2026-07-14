import userEvent from "@testing-library/user-event";

import {
  setupCreateLibraryEndpoint,
  setupCreateLibraryEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { LibraryEmptyState } from "./LibraryEmptyState";

type SetupOpts = {
  section?: "tables" | "metrics";
  hasCreateError?: boolean;
  onPublishTable?: () => void;
};

function setup({
  section = "tables",
  hasCreateError,
  onPublishTable,
}: SetupOpts = {}) {
  if (hasCreateError) {
    setupCreateLibraryEndpointError();
  } else {
    setupCreateLibraryEndpoint(
      createMockCollection({
        id: 1,
        type: "library",
        children: [
          createMockCollection({ id: 2, type: "library-data" }),
          createMockCollection({ id: 3, type: "library-metrics" }),
        ],
      }),
    );
  }

  renderWithProviders(
    <LibraryEmptyState section={section} onPublishTable={onPublishTable} />,
  );
}

describe("LibraryEmptyState", () => {
  it("should show published tables empty state", () => {
    setup({ section: "tables" });
    expect(screen.getByText("Published tables")).toBeInTheDocument();
    expect(screen.getByText("Publish a table")).toBeInTheDocument();
  });

  it("should show metrics empty state", () => {
    setup({ section: "metrics" });
    expect(screen.getByText("Metrics")).toBeInTheDocument();
    expect(screen.getByText("Create a metric")).toBeInTheDocument();
  });

  it("should create the library and open publish table", async () => {
    const onPublishTable = jest.fn();
    setup({ section: "tables", onPublishTable });
    await userEvent.click(screen.getByText("Publish a table"));
    await waitFor(() => expect(onPublishTable).toHaveBeenCalledTimes(1));
  });

  it("should show a library creation error", async () => {
    setup({ hasCreateError: true });
    await userEvent.click(screen.getByText("Publish a table"));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
