import { type ReactNode, useCallback } from "react";

import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import { Outlet, RESET_SCROLL_ON_NAVIGATE, Route } from "metabase/router";

type FakeLayout = { scrollHeight: number; clientHeight: number };

const fakedElements = new WeakSet<HTMLElement>();

/**
 * jsdom has no layout, so give the element one that clamps like a browser.
 * Reading the offset lays the element out, so content that got shorter lowers
 * it for good, as it does in a browser.
 */
function fakeScrollLayout(element: HTMLElement, layout: FakeLayout) {
  if (fakedElements.has(element)) {
    return;
  }
  fakedElements.add(element);
  const getMaxScrollTop = () =>
    Math.max(0, layout.scrollHeight - layout.clientHeight);
  let scrollTop = 0;

  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => layout.scrollHeight },
    clientHeight: { configurable: true, get: () => layout.clientHeight },
    scrollTop: {
      configurable: true,
      get: () => {
        scrollTop = Math.min(scrollTop, getMaxScrollTop());
        return scrollTop;
      },
      set: (value: number) => {
        const clampedValue = Math.max(0, Math.min(value, getMaxScrollTop()));
        if (clampedValue !== scrollTop) {
          scrollTop = clampedValue;
          element.dispatchEvent(new Event("scroll"));
        }
      },
    },
  });
}

type ScrollerProps = {
  testId: string;
  layout: FakeLayout;
  isPageScroller?: boolean;
  children?: ReactNode;
};

const Scroller = ({
  testId,
  layout,
  isPageScroller = false,
  children,
}: ScrollerProps) => {
  const fakeLayoutRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        fakeScrollLayout(element, layout);
      }
    },
    [layout],
  );
  return (
    <div
      ref={fakeLayoutRef}
      data-testid={testId}
      {...(isPageScroller ? RESET_SCROLL_ON_NAVIGATE : {})}
    >
      {children}
    </div>
  );
};

type SetupOpts = {
  initialRoute?: string;
};

const setup = ({ initialRoute = "/a" }: SetupOpts = {}) => {
  const pageLayout: FakeLayout = { scrollHeight: 2000, clientHeight: 500 };
  const sidebarLayout: FakeLayout = { scrollHeight: 1000, clientHeight: 500 };
  const remountingLayout: FakeLayout = {
    scrollHeight: 2000,
    clientHeight: 500,
  };

  const PersistentLayout = () => (
    <>
      <Scroller testId="sidebar" layout={sidebarLayout} />
      <Scroller testId="page-scroller" layout={pageLayout} isPageScroller>
        <Outlet />
      </Scroller>
    </>
  );

  const utils = renderWithProviders(
    <>
      <Route element={<PersistentLayout />}>
        <Route path="a" element={<div>Page A</div>} />
        <Route path="b" element={<div>Page B</div>} />
      </Route>
      <Route
        path="c"
        element={
          <Scroller testId="remounting-scroller" layout={remountingLayout} />
        }
      />
    </>,
    { withRouter: true, initialRoute },
  );

  const { router } = utils;
  if (!router) {
    throw new Error("Expected a router");
  }

  const inAct = async (navigation: () => void) => {
    await act(async () => navigation());
  };

  return {
    ...utils,
    pageLayout,
    navigate: (path: string) => inAct(() => router.navigate(path)),
    replace: (path: string) =>
      inAct(() => router.navigate(path, { replace: true })),
    goBack: () => inAct(() => router.back()),
    goForward: () => inAct(() => router.forward()),
  };
};

const getScrollTop = (testId: string) => screen.getByTestId(testId).scrollTop;

const scroll = (testId: string, scrollTop: number) => {
  act(() => {
    screen.getByTestId(testId).scrollTop = scrollTop;
  });
};

const advanceFrames = (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

describe("useScrollRestoration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(["navigate", "replace"] as const)(
    "scrolls page scrollers to the top on a %s to a new path, and leaves other scrollers alone",
    async (navigation) => {
      const utils = setup();
      scroll("page-scroller", 700);
      scroll("sidebar", 300);

      await utils[navigation]("/b");

      expect(screen.getByText("Page B")).toBeInTheDocument();
      expect(getScrollTop("page-scroller")).toBe(0);
      expect(getScrollTop("sidebar")).toBe(300);
    },
  );

  it("keeps the scroll position when only the search changes", async () => {
    const { navigate } = setup();
    scroll("page-scroller", 700);

    await navigate("/a?tab=2");

    expect(getScrollTop("page-scroller")).toBe(700);
  });

  it("keeps an entry's scroll position when a replace changes only its search", async () => {
    const { navigate, goBack, replace } = setup();
    scroll("page-scroller", 700);
    await replace("/a?filter=1");
    await navigate("/b");

    await goBack();

    expect(getScrollTop("page-scroller")).toBe(700);
  });

  it("restores each history entry's scroll position on back and forward", async () => {
    const { navigate, goBack, goForward } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");
    scroll("page-scroller", 100);

    await goBack();
    expect(screen.getByText("Page A")).toBeInTheDocument();
    expect(getScrollTop("page-scroller")).toBe(700);

    await goForward();
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(getScrollTop("page-scroller")).toBe(100);
  });

  it("restores a scroller that remounted", async () => {
    const { navigate, goBack } = setup({ initialRoute: "/c" });
    scroll("remounting-scroller", 600);
    await navigate("/a");
    expect(screen.queryByTestId("remounting-scroller")).not.toBeInTheDocument();

    await goBack();

    expect(getScrollTop("remounting-scroller")).toBe(600);
  });

  it("scrolls as far as it can while content loads, then the rest of the way once it is tall enough", async () => {
    const { navigate, pageLayout, goBack } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");
    pageLayout.scrollHeight = 800;

    await goBack();
    // An offset can go up to the content height minus the visible height.
    expect(getScrollTop("page-scroller")).toBe(300);

    pageLayout.scrollHeight = 2000;
    advanceFrames(50);
    expect(getScrollTop("page-scroller")).toBe(700);
  });

  it.each(["navigate", "replace"] as const)(
    "keeps restoring when the page changes only its search with a %s while it loads",
    async (navigation) => {
      const utils = setup();
      scroll("page-scroller", 700);
      await utils.navigate("/b");
      utils.pageLayout.scrollHeight = 500;
      await utils.goBack();

      await utils[navigation]("/a?filter=1");
      utils.pageLayout.scrollHeight = 2000;
      advanceFrames(50);

      expect(getScrollTop("page-scroller")).toBe(700);
    },
  );

  it.each(["navigate", "replace"] as const)(
    "stops restoring on a %s to a new path",
    async (navigation) => {
      const utils = setup();
      scroll("page-scroller", 700);
      await utils.navigate("/b");
      utils.pageLayout.scrollHeight = 500;
      await utils.goBack();

      await utils[navigation]("/b");
      utils.pageLayout.scrollHeight = 2000;
      advanceFrames(50);

      expect(screen.getByText("Page B")).toBeInTheDocument();
      expect(getScrollTop("page-scroller")).toBe(0);
    },
  );

  it("restores the position when content collapses and grows back between frames", async () => {
    const { navigate, pageLayout, goBack } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");
    await goBack();
    expect(getScrollTop("page-scroller")).toBe(700);

    pageLayout.scrollHeight = 500;
    expect(getScrollTop("page-scroller")).toBe(0);
    pageLayout.scrollHeight = 2000;
    advanceFrames(50);

    expect(getScrollTop("page-scroller")).toBe(700);
  });

  it("stops restoring once the user starts scrolling", async () => {
    const { navigate, pageLayout, goBack } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");
    pageLayout.scrollHeight = 500;
    await goBack();

    fireEvent.wheel(screen.getByTestId("page-scroller"));
    pageLayout.scrollHeight = 2000;
    advanceFrames(50);

    expect(getScrollTop("page-scroller")).toBe(0);
  });

  it("stops restoring when content takes too long to load", async () => {
    const { navigate, pageLayout, goBack } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");
    pageLayout.scrollHeight = 500;
    await goBack();

    advanceFrames(3100);
    pageLayout.scrollHeight = 2000;
    advanceFrames(50);

    expect(getScrollTop("page-scroller")).toBe(0);
  });

  it("restores the position after a reload", async () => {
    const first = setup();
    scroll("page-scroller", 700);
    first.unmount();
    // Element keys are document paths, so the reloaded page must sit where the
    // first one did.
    first.container.remove();

    setup();

    expect(getScrollTop("page-scroller")).toBe(700);
  });

  it.each([
    ["not JSON", "{not json"],
    ["not in the expected shape", '[["entry", [["body > main", "700"]]]]'],
  ])("works when the saved positions are %s", async (_, stored) => {
    sessionStorage.setItem("metabase-scroll-positions", stored);
    const { navigate, goBack } = setup();
    scroll("page-scroller", 700);
    await navigate("/b");

    await goBack();

    expect(getScrollTop("page-scroller")).toBe(700);
  });
});
