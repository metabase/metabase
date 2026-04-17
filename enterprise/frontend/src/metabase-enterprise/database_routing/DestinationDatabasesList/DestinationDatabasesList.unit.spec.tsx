import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { useListDatabasesQuery } from "metabase/api";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import {
  DestinationDatabasesList,
  type DestinationDatabasesListProps,
} from "./DestinationDatabasesList";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useListDatabasesQuery: jest.fn(),
}));

interface SetupOpts {
  mockDbCount: number;
  useListDatabasesQueryMockValue?: (mockDbs: Database[]) => any;
  props?: Partial<DestinationDatabasesListProps>;
  mockState?: State;
  isAdmin?: boolean;
}

function setup({
  mockDbCount,
  useListDatabasesQueryMockValue,
  props,
  isAdmin = true,
}: SetupOpts) {
  const mockDbs = new Array(mockDbCount)
    .fill(null)
    .map((_, i) => createMockDatabase({ id: i + 2 }));
  mockDbs.forEach((db) => setupDatabaseEndpoints(db));

  (useListDatabasesQuery as jest.Mock).mockReturnValue(
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useListDatabasesQueryMockValue?.(mockDbs) ?? {
      isLoading: false,
      error: null,
      data: { data: mockDbs, total: mockDbs.length },
    },
  );

  renderWithProviders(
    <DestinationDatabasesList primaryDatabaseId={1} {...props} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
}

describe("DestinationDatabasesList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render empty state when no databases found", async () => {
    setup({ mockDbCount: 0 });
    expect(
      await screen.findByText("No destination databases added yet"),
    ).toBeInTheDocument();
  });

  it("should not limit by default", async () => {
    setup({ mockDbCount: 6 });

    expect(
      await screen.findAllByTestId("destination-db-list-item"),
    ).toHaveLength(6);
    expect(screen.queryByText(/View all/)).not.toBeInTheDocument();
  });

  it("should limit results by preview count", async () => {
    setup({ mockDbCount: 6, props: { previewCount: 5 } });

    expect(
      await screen.findAllByTestId("destination-db-list-item"),
    ).toHaveLength(5);
    expect(await screen.findByText("View all 6")).toBeInTheDocument();
  });

  it("should show edit and remove action for admins", async () => {
    setup({ mockDbCount: 1 });

    expect(
      await screen.findAllByTestId("destination-db-list-item"),
    ).toHaveLength(1);
    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Edit")).toBeInTheDocument();
    expect(await screen.findByText("Remove")).toBeInTheDocument();
  });

  it("should only show edit action for non-admins", async () => {
    setup({ mockDbCount: 1, isAdmin: false });

    expect(
      await screen.findAllByTestId("destination-db-list-item"),
    ).toHaveLength(1);
    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Edit")).toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });
});
