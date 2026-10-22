import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import NewTimelineModal from "./NewTimelineModal";

const collection = createMockCollection({ id: 7, name: "Launches" });

// The create endpoint returns the bare row, without the hydrated collection.
const createdTimeline = createMockTimeline({
  id: 9,
  collection_id: 7,
  collection: undefined,
});

function setup() {
  setupCollectionByIdEndpoint({ collections: [collection] });
  fetchMock.post("path:/api/timeline", createdTimeline);

  const { router } = renderWithProviders(
    <Route path="collection/:slug">
      <Route
        path="timelines/new"
        element={<NewTimelineModal params={{ slug: "7-launches" }} />}
      />
      <Route path="timelines/:timelineId" element={<div>Timeline page</div>} />
    </Route>,
    { withRouter: true, initialRoute: "/collection/7-launches/timelines/new" },
  );

  return { pathname: () => router?.location.pathname };
}

describe("NewTimelineModalContainer", () => {
  it("navigates to the new timeline in its collection", async () => {
    const { pathname } = setup();

    await userEvent.type(await screen.findByLabelText("Name"), "Releases");
    await userEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(pathname()).toBe(
        Urls.timelineInCollection({ ...createdTimeline, collection }),
      );
    });
    expect(screen.getByText("Timeline page")).toBeInTheDocument();
  });
});
