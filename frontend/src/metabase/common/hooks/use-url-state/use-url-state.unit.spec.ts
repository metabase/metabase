import { createMockLocation } from "__support__/state";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { type Location, useLocation } from "metabase/router";

import type { QueryParam } from "./types";
import { type UrlStateConfig, useUrlState } from "./use-url-state";
import { getFirstParamValue } from "./utils";

type UrlState = {
  name: string | null;
  score: number | null;
};

interface SetupOpts {
  location?: Location;
  replace?: boolean;
  syncFromLocation?: boolean;
}

const setup = ({
  location = createMockLocation(),
  replace = false,
  syncFromLocation = false,
}: SetupOpts = {}) => {
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
    replace,
    syncFromLocation,
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

  it("follows external changes to the query when requested", async () => {
    const { result, router } = setup({
      location: createLocation("?name=abc"),
      syncFromLocation: true,
    });

    act(() => {
      router?.navigate("/?name=xyz&score=5");
    });

    await waitFor(() => {
      expect(result.current[0]).toEqual({ name: "xyz", score: 5 });
      expect(router?.location.search).toBe("?name=xyz&score=5");
    });
  });

  it("replaces rather than pushes programmatic patches when requested", async () => {
    const { result, router } = setup({
      location: createLocation("?name=abc"),
      replace: true,
      syncFromLocation: true,
    });

    act(() => {
      router?.navigate("/?name=first");
    });
    await waitFor(() => expect(result.current[0].name).toBe("first"));

    act(() => {
      result.current[1].patchUrlState({ name: "second" }, { immediate: true });
    });
    expect(router?.location.search).toBe("?name=second");
    act(() => {
      router?.back();
    });
    await waitFor(() => {
      expect(router?.location.search).toBe("?name=abc");
      expect(result.current[0].name).toBe("abc");
    });
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
});

function createLocation(search: string) {
  return createMockLocation({ search });
}
