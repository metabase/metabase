import userEvent from "@testing-library/user-event";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { UnreadableCard } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import {
  LIBRARY_METRIC,
  ORDERS_QUESTION,
  REVENUE_METRIC,
  SHARED_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../test-utils";

import { ContentsTable } from "./ContentsTable";
import type { ContentItem, ContentOwner } from "./types";

const OWNER: ContentOwner = {
  model: "dashboard",
  id: 10,
  name: "Sales overview",
};

const DASHBOARD_QUESTION = createMockCard({
  id: 3,
  name: "Weekly signups",
  type: "question",
  dashboard_id: OWNER.id,
});

const UNREADABLE_CARD: UnreadableCard = { id: 99 };

function setup(items: ContentItem[]) {
  mockGetBoundingClientRect({ width: 1000, height: 800 });
  setupLibraryCollectionEndpoints([SHARED_COLLECTION]);

  renderWithProviders(
    <ContentsTable
      items={items}
      owner={OWNER}
      emptyMessage="This dashboard has no questions yet"
    />,
  );
}

describe("ContentsTable", () => {
  it("shows a row per card with its type and location", async () => {
    setup([ORDERS_QUESTION, REVENUE_METRIC, DASHBOARD_QUESTION]);

    const ordersRow = screen.getByRole("row", { name: /Orders/ });
    expect(within(ordersRow).getByText("Question")).toBeInTheDocument();
    expect(await within(ordersRow).findByText("Shared")).toBeInTheDocument();

    const revenueRow = screen.getByRole("row", { name: /Revenue/ });
    expect(within(revenueRow).getByText("Metric")).toBeInTheDocument();
    expect(await within(revenueRow).findByText("Shared")).toBeInTheDocument();

    const signupsRow = screen.getByRole("row", { name: /Weekly signups/ });
    expect(within(signupsRow).getByText("Question")).toBeInTheDocument();
    expect(within(signupsRow).getByText("Sales overview")).toBeInTheDocument();
  });

  it("links only metrics saved in the Library to Data Studio", async () => {
    setup([ORDERS_QUESTION, REVENUE_METRIC, LIBRARY_METRIC]);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Churn rate/ })).toHaveAttribute(
        "href",
        "/data-studio/library/metrics/4",
      ),
    );
    expect(screen.getByRole("link", { name: /Revenue/ })).toHaveAttribute(
      "href",
      "/metric/2-revenue",
    );
    expect(screen.getByRole("link", { name: /Orders/ })).toHaveAttribute(
      "href",
      "/question/1-orders",
    );
  });

  it("filters the cards by name and reports when nothing matches", async () => {
    setup([ORDERS_QUESTION, REVENUE_METRIC, UNREADABLE_CARD]);
    const searchInput = screen.getByPlaceholderText("Search...");
    expect(screen.getByText("Restricted question")).toBeInTheDocument();

    await userEvent.type(searchInput, "rev");
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Restricted question")).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "churn");
    expect(screen.getByText('No results for "churn"')).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
  });
});
