import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDependencyCountsEndpoint,
  setupDependencyCountsErrorEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  useDeleteCardMutation,
  useUpdateCollectionMutation,
} from "metabase/api";
import { Route } from "metabase/router";
import { Button } from "metabase/ui";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type { DependencyCountsResponse } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { DependencyDiagnosticsSectionLayout } from "../../routes";

import { DiagnosticsHeader } from "./DiagnosticsHeader";

interface SetupOpts {
  counts?: DependencyCountsResponse;
  error?: boolean;
  delay?: number;
  withMutation?: boolean;
}

function DeleteQuestionButton() {
  const [deleteCard] = useDeleteCardMutation();
  const handleDelete = async () => {
    await deleteCard(1).unwrap();
  };
  return <Button onClick={handleDelete}>Delete question</Button>;
}

function ArchiveCollectionButton() {
  const [updateCollection] = useUpdateCollectionMutation();
  const handleArchive = async () => {
    await updateCollection({ id: 1, archived: true }).unwrap();
  };
  return <Button onClick={handleArchive}>Archive collection</Button>;
}

function setup({
  counts = { breaking: 137, unreferenced: 0 },
  error = false,
  delay,
  withMutation = false,
}: SetupOpts = {}) {
  if (error) {
    setupDependencyCountsErrorEndpoint();
  } else {
    setupDependencyCountsEndpoint(counts, { delay, name: "dependency-counts" });
  }
  if (withMutation) {
    fetchMock.delete("path:/api/card/1", { status: 204 });
    setupUpdateCollectionEndpoint(
      createMockCollection({ id: 1, archived: true }),
    );
  }
  return renderWithProviders(
    <Route element={<DependencyDiagnosticsSectionLayout />}>
      <Route
        path="*"
        element={
          <>
            <DiagnosticsHeader />
            {withMutation && (
              <>
                <DeleteQuestionButton />
                <ArchiveCollectionButton />
              </>
            )}
          </>
        }
      />
    </Route>,
    {
      withRouter: true,
      initialRoute: Urls.brokenDependencies({ query: "filtered", page: 2 }),
    },
  );
}

const getTab = (name: string) => screen.getByRole("link", { name });
const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/dependencies/counts");

describe("DiagnosticsHeader", () => {
  it("shows exact default counts, including zero, without fetching either table", async () => {
    setup();

    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeInTheDocument();
    expect(
      within(getTab("Unreferenced entities")).getByText("0"),
    ).toBeInTheDocument();
    expect(getCountCalls()).toHaveLength(1);
    expect(new URL(getCountCalls()[0].url).search).toBe("");
    expect(
      fetchMock.callHistory.calls("path:/api/ee/dependencies/graph/breaking"),
    ).toHaveLength(0);
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/dependencies/graph/unreferenced",
      ),
    ).toHaveLength(0);
  });

  it("keeps navigation usable while counts load", async () => {
    setup({ delay: 100 });

    expect(
      within(getTab("Broken dependencies")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(
      within(getTab("Unreferenced entities")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(getTab("Unreferenced entities")).toHaveAttribute(
      "href",
      Urls.unreferencedDependencies(),
    );
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeInTheDocument();
  });

  it("hides failed counts without removing the tabs", async () => {
    setup({ error: true });

    await waitFor(() => {
      expect(getCountCalls()).toHaveLength(1);
      expect(
        fetchMock.callHistory.done("path:/api/ee/dependencies/counts"),
      ).toBe(true);
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
    });
    expect(
      within(getTab("Broken dependencies")).queryByText(/\d/),
    ).not.toBeInTheDocument();
    expect(
      within(getTab("Unreferenced entities")).queryByText(/\d/),
    ).not.toBeInTheDocument();
  });

  it("refreshes counts when a collection is archived", async () => {
    setup({ withMutation: true });
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeInTheDocument();
    fetchMock.modifyRoute("dependency-counts", {
      response: { breaking: 0, unreferenced: 1 },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Archive collection" }),
    );

    expect(
      await within(getTab("Broken dependencies")).findByText("0"),
    ).toBeInTheDocument();
    expect(
      within(getTab("Unreferenced entities")).getByText("1"),
    ).toBeInTheDocument();
    expect(getCountCalls()).toHaveLength(2);
  });

  it("refreshes after entity mutations and retains known counts during the refresh", async () => {
    setup({ withMutation: true });
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeInTheDocument();

    const pendingCounts = defer<DependencyCountsResponse>();
    fetchMock.modifyRoute("dependency-counts", {
      response: () => pendingCounts.promise,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Delete question" }),
    );

    await waitFor(() => expect(getCountCalls()).toHaveLength(2));
    expect(
      within(getTab("Broken dependencies")).getByText("137"),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
    await act(async () =>
      pendingCounts.resolve({ breaking: 136, unreferenced: 0 }),
    );
    expect(
      await within(getTab("Broken dependencies")).findByText("136"),
    ).toBeInTheDocument();
  });
});
