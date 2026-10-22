import { createMockLocation } from "__support__/state";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import * as Router from "metabase/router";
import { type Location, useLocation } from "metabase/router";
import { delay } from "metabase/utils/promise";

import type { QueryParam } from "./types";
import {
  URL_UPDATE_DEBOUNCE_DELAY,
  type UrlStateConfig,
  useUrlState,
} from "./use-url-state";
import { getFirstParamValue } from "./utils";

type UrlState = {
  name: string | null;
  score: number | null;
};

interface SetupOpts {
  location?: Location;
}

const setup = ({ location = createMockLocation() }: SetupOpts = {}) => {
  const parseName = (param: QueryParam): UrlState["name"] => {
    const value = getFirstParamValue(param);
    return value ?? null;
  };

  const parseScore = (param: QueryParam): UrlState["score"] => {
    const value = getFirstParamValue(param);
    if (!value) {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const config: UrlStateConfig<UrlState> = {
    parse: (query) => ({
      name: parseName(query.name),
      score: parseScore(query.score),
    }),
    serialize: ({ name, score }) => ({
      name: name == null ? undefined : name,
      score: score == null ? undefined : String(score),
    }),
  };

  return renderHookWithProviders(() => useUrlState(useLocation(), config), {
    initialRoute: `${location.pathname}${location.search}`,
    withRouter: true,
  });
};

describe("useUrlState", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("works with missing query params", () => {
    const { result } = setup();
    const [state] = result.current;
    expect(state).toEqual({ name: null, score: null });
  });

  it("parses query params", () => {
    const location = createLocation("?name=abc&score=123");
    const { result } = setup({ location });
    const [state] = result.current;
    expect(state).toEqual({ name: "abc", score: 123 });
  });

  it("parses partial query params", () => {
    const location = createLocation("?score=123");
    const { result } = setup({ location });
    const [state] = result.current;
    expect(state).toEqual({ name: null, score: 123 });
  });

  it("replaces unparsable query params", () => {
    const location = createLocation("?name=abc&score=abc");
    const { result, router } = setup({ location });
    const [state] = result.current;
    expect(state).toEqual({ name: "abc", score: null });
    expect(router?.location.search).toEqual("?name=abc");
  });

  it("patches query params", async () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });
    const [_state, { patchUrlState }] = result.current;

    act(() => {
      patchUrlState({ score: 456 });
    });

    const [state] = result.current;
    expect(state).toEqual({ name: "abc", score: 456 });
    expect(router?.location.search).toEqual("?name=abc&score=123");
    await waitFor(() => {
      expect(router?.location.search).toEqual("?name=abc&score=456");
    });
  });

  it("patches partial query params", async () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });
    const [_state, { patchUrlState }] = result.current;

    act(() => {
      patchUrlState({ name: "xyz", score: 456 });
    });

    const [state] = result.current;
    expect(state).toEqual({ name: "xyz", score: 456 });
    expect(router?.location.search).toEqual("?name=abc&score=123");
    await waitFor(() => {
      expect(router?.location.search).toEqual("?name=xyz&score=456");
    });
  });

  it("syncs the URL right away when patched with immediate: true", () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });
    const [_state, { patchUrlState }] = result.current;

    act(() => {
      patchUrlState({ score: 456 }, { immediate: true });
    });

    const [state] = result.current;
    expect(state).toEqual({ name: "abc", score: 456 });
    expect(router?.location.search).toEqual("?name=abc&score=456");
  });

  it("consumes the immediate bypass once, then debounces the next patch", async () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });

    act(() => {
      const [, { patchUrlState }] = result.current;
      patchUrlState({ score: 456 }, { immediate: true });
    });

    // The immediate patch is synced right away.
    expect(router?.location.search).toEqual("?name=abc&score=456");

    act(() => {
      const [, { patchUrlState }] = result.current;
      patchUrlState({ name: "xyz" });
    });

    // The following default patch must still debounce.
    expect(router?.location.search).toEqual("?name=abc&score=456");
    await waitFor(() => {
      expect(router?.location.search).toEqual("?name=xyz&score=456");
    });
  });

  it("follows the url on navigation, back and forward", () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });

    act(() => router?.navigate(location.pathname));
    expect(result.current[0]).toEqual({ name: null, score: null });

    act(() => router?.back());
    expect(result.current[0]).toEqual({ name: "abc", score: 123 });

    act(() => router?.forward());
    expect(result.current[0]).toEqual({ name: null, score: null });
  });

  it("removes query params", async () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });
    const [_state, { patchUrlState }] = result.current;

    act(() => {
      patchUrlState({ name: null, score: null });
    });

    const [state] = result.current;
    expect(state).toEqual({ name: null, score: null });
    expect(router?.location.search).toEqual("?name=abc&score=123");
    await waitFor(() => {
      expect(router?.location.search).toEqual("");
    });
  });

  it("exposes the search for the patched state before the URL catches up", async () => {
    const location = createLocation("?name=abc&score=123");
    const { result, router } = setup({ location });

    act(() => {
      const [, { patchUrlState }] = result.current;
      patchUrlState({ score: 456 });
    });

    const [, { searchString }] = result.current;
    expect(searchString).toEqual("?name=abc&score=456");
    expect(router?.location.search).toEqual("?name=abc&score=123");
    await waitFor(() => {
      expect(router?.location.search).toEqual("?name=abc&score=456");
    });
  });

  it("does not write the URL while a navigation is pending", async () => {
    const location = createLocation("?name=abc");
    const { result, router } = setup({ location });
    jest.spyOn(Router, "getIsNavigationPending").mockReturnValue(true);

    act(() => {
      const [, { patchUrlState }] = result.current;
      patchUrlState({ score: 456 });
    });

    await act(() => delay(URL_UPDATE_DEBOUNCE_DELAY + 50));
    expect(router?.location.search).toEqual("?name=abc");
  });

  it("does not write the URL after the router navigated away (GDGT-3380)", async () => {
    const location = createLocation("?name=abc");
    const { result, router } = setup({ location });
    // a real navigation re-renders before the debounced write, so this is the only way to open the window
    jest
      .spyOn(Router, "getRouterLocation")
      .mockReturnValue(createMockLocation({ key: "navigated-away" }));

    act(() => {
      const [, { patchUrlState }] = result.current;
      patchUrlState({ score: 456 });
    });

    await act(() => delay(URL_UPDATE_DEBOUNCE_DELAY + 50));
    expect(router?.location.search).toEqual("?name=abc");
  });
});

function createLocation(search: string) {
  return createMockLocation({ search });
}
