import userEvent from "@testing-library/user-event";

import { renderRoutes, screen } from "__support__/ui";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { Outlet } from "metabase/router";

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

function setup(initialRoute: string) {
  const { router } = renderRoutes(
    [
      {
        path: "collection/:slug",
        element: <CollectionPage />,
        children: getCollectionTimelineRoutes(),
      },
    ],
    { initialRoute },
  );

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
});
