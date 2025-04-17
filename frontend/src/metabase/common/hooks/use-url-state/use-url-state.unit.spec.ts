import type { Location } from "history";

import { renderHookWithProviders } from "__support__/ui";
import { createMockLocation } from "metabase-types/store/mocks";

import {
  type QueryParam,
  type UrlStateConfig,
  useUrlState,
} from "./use-url-state";

type UrlState = {
  name: string | null;
  score: number | null;
};

interface SetupOpts {
  location?: Location;
}

const setup = ({ location = createMockLocation() }: SetupOpts = {}) => {
  const parseName = (param: QueryParam): UrlState["name"] => {
    const value = Array.isArray(param) ? param[0] : param;
    return value ?? null;
  };

  const parseScore = (param: QueryParam): UrlState["score"] => {
    const value = Array.isArray(param) ? param[0] : param;
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

  return renderHookWithProviders(() => useUrlState(location, config), {
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

  it("replaces unparsable query params", async () => {
    const location = createLocation("?name=abc&score=abc");
    const { result, history } = setup({ location });
    const [state] = result.current;
    expect(state).toEqual({ name: "abc", score: null });
    expect(history?.getCurrentLocation().search).toEqual("?name=abc");
  });
});

function createLocation(search: string) {
  const params = new URLSearchParams(search);
  const query = Object.fromEntries(params.entries());
  return createMockLocation({ search, query });
}
