import userEvent from "@testing-library/user-event";

import { renderRoutes, renderWithProviders, screen } from "__support__/ui";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import {
  type MemoryTestRouterHolder,
  Outlet,
  RouterProviderMemory,
} from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

import { getCollectionTimelineRoutes } from "./routes";

function mockModal({ onClose }: ModalComponentProps) {
  return <button onClick={onClose}>Close</button>;
}

function mockModalModule() {
  return { __esModule: true, default: mockModal };
}

jest.mock("./containers/TimelineIndexModal", () => mockModalModule());
jest.mock("./containers/NewTimelineModal", () => mockModalModule());
jest.mock("./containers/TimelineListArchiveModal", () => mockModalModule());
jest.mock("./containers/TimelineDetailsModal", () => mockModalModule());
jest.mock("./containers/EditTimelineModal", () => mockModalModule());
jest.mock("./containers/MoveTimelineModal", () => mockModalModule());
jest.mock("./containers/TimelineArchiveModal", () => mockModalModule());
jest.mock("./containers/DeleteTimelineModal", () => mockModalModule());
jest.mock("./containers/NewEventWithTimelineModal", () => mockModalModule());
jest.mock("./containers/NewEventModal", () => mockModalModule());
jest.mock("./containers/EditEventModal", () => mockModalModule());
jest.mock("./containers/MoveEventModal", () => mockModalModule());
jest.mock("./containers/DeleteEventModal", () => mockModalModule());

function CollectionPage() {
  return (
    <div>
      <span>Collection page</span>
      <Outlet />
    </div>
  );
}

const routes = [
  {
    path: "collection/:slug",
    element: <CollectionPage />,
    children: getCollectionTimelineRoutes(),
  },
];

function setup(initialRoute: string) {
  const { router } = renderRoutes(routes, { initialRoute });

  return { pathname: () => router?.location.pathname };
}

const close = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Close" }));
};

describe("collection timeline routes", () => {
  it.each([
    {
      from: "/collection/5/timelines/new",
      to: "/collection/5/timelines",
    },
    {
      from: "/collection/5/timelines/new/events/new",
      to: "/collection/5/timelines",
    },
    {
      from: "/collection/5/timelines/archive",
      to: "/collection/5/timelines",
    },
    {
      from: "/collection/5/timelines/9/edit",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/move",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/archive",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/delete",
      to: "/collection/5/timelines/archive",
    },
    {
      from: "/collection/5/timelines/9/events/new",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/events/1/edit",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/events/1/move",
      to: "/collection/5/timelines/9",
    },
    {
      from: "/collection/5/timelines/9/events/1/delete",
      to: "/collection/5/timelines/9/archive",
    },
  ])("closes from $from to $to", async ({ from, to }) => {
    const { pathname } = setup(from);

    await close();

    expect(pathname()).toBe(to);
    expect(screen.getByText("Collection page")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
  });

  // The index modal shows the same timeline again when it is the only one, so
  // closing the details modal to it would look like nothing happened.
  it("closes the timeline details modal to the collection page (metabase#83006)", async () => {
    const { pathname } = setup("/collection/5/timelines/9");

    await close();

    expect(pathname()).toBe("/collection/5");
    expect(screen.getByText("Collection page")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  });

  it("closes the timeline details modal to the collection page when hosted on a subpath", async () => {
    const routerHolder: MemoryTestRouterHolder = { current: null };
    renderWithProviders(
      <RouterProviderMemory
        routes={routes}
        initialRoute="/metabase/collection/5/timelines/9"
        basename="/metabase"
        routerHolder={routerHolder}
      />,
    );

    await close();

    const router = checkNotNull(routerHolder.current);
    expect(router.createHref(router.state.location)).toBe(
      "/metabase/collection/5",
    );
    expect(screen.getByText("Collection page")).toBeInTheDocument();
  });
});
