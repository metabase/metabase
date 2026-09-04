import { observeLinkForPrefetch, registerPagePrefetch } from "./prefetch";

let nextId = 0;
const uniquePath = () => `/prefetch-visible-spec-${nextId++}`;

type Callback = (
  entries: { target: Element; isIntersecting: boolean }[],
) => void;

let observed: Element[] = [];
let unobserved: Element[] = [];
let fire: Callback = () => undefined;

function mockHover(hasHover: boolean) {
  // Only `matches` is read, so the stub does not implement the rest of
  // `MediaQueryList`.
  window.matchMedia = ((query: string) => ({
    matches: query === "(hover: hover)" ? hasHover : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  observed = [];
  unobserved = [];
  // Only the three methods used here are implemented, so the stub is not a
  // structural `IntersectionObserver`.
  globalThis.IntersectionObserver = class {
    constructor(callback: Callback) {
      fire = callback;
    }
    observe(element: Element) {
      observed.push(element);
    }
    unobserve(element: Element) {
      unobserved.push(element);
    }
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

describe("observeLinkForPrefetch", () => {
  it("loads the page when the link comes into view", () => {
    mockHover(false);
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    const element = document.createElement("a");
    observeLinkForPrefetch(element, path);
    expect(load).not.toHaveBeenCalled();

    fire([{ target: element, isIntersecting: true }]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does nothing until the link is actually intersecting", () => {
    mockHover(false);
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    const element = document.createElement("a");
    observeLinkForPrefetch(element, path);
    fire([{ target: element, isIntersecting: false }]);

    expect(load).not.toHaveBeenCalled();
  });

  // Hovering is a better signal of intent, and a device with a pointer already
  // prefetches on it. Watching there would fetch pages nobody asked for.
  it("does not watch anything on a device that can hover", () => {
    mockHover(true);
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    observeLinkForPrefetch(document.createElement("a"), path);

    expect(observed).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("stops watching a link once it has been seen", () => {
    mockHover(false);
    const path = uniquePath();
    registerPagePrefetch(path, jest.fn().mockResolvedValue(undefined));

    const element = document.createElement("a");
    observeLinkForPrefetch(element, path);
    fire([{ target: element, isIntersecting: true }]);

    expect(unobserved).toContain(element);
  });

  // The point of watching every link on screen: a list of many links to the
  // same page still costs one fetch, because `prefetchPage` starts each
  // registered page once.
  it("loads a shared target once however many links are seen", () => {
    mockHover(false);
    const path = uniquePath();
    const load = jest.fn().mockResolvedValue(undefined);
    registerPagePrefetch(path, load);

    const links = [0, 1, 2].map(() => document.createElement("a"));
    links.forEach((element) => observeLinkForPrefetch(element, path));
    fire(links.map((target) => ({ target, isIntersecting: true })));

    expect(load).toHaveBeenCalledTimes(1);
  });
});
