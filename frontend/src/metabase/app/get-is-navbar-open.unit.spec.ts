import type { State } from "metabase/redux/store";

// getIsNavbarOpen (shared) decides the embedded "force the sidebar open" guard
// with a feature-free proxy (`!top_nav || fullscreen`) instead of the app-tier
// getIsAppBarVisible, which reads dashboard / query_builder state. These tests
// prove the proxy is exactly equivalent to the real getIsAppBarVisible wherever
// the value is observable (i.e. wherever the navbar actually renders).
//
// We mock only the *feature leaf* selectors, so we can sweep lineage / collection
// / editing freely while the real getIsAppBarVisible composition (suppressors,
// the "any app-bar element" OR, the top_nav gate) runs unmocked.

jest.mock("metabase/utils/iframe", () => ({ isWithinIframe: jest.fn() }));
jest.mock("metabase/dashboard/selectors", () => ({
  getDashboard: jest.fn(),
  getDashboardId: jest.fn(),
  getIsEditing: jest.fn(),
}));
jest.mock("metabase/query_builder/selectors", () => ({
  getQuestion: jest.fn(),
  getIsSavedQuestionChanged: jest.fn(),
}));
jest.mock("metabase/documents/selectors", () => ({
  getCurrentDocument: jest.fn(),
}));

import { getIsAppBarVisible, getIsNavBarEnabled } from "metabase/app/selectors";
import { getDashboard, getIsEditing } from "metabase/dashboard/selectors";
import { getCurrentDocument } from "metabase/documents/selectors";
import {
  getIsSavedQuestionChanged,
  getQuestion,
} from "metabase/query_builder/selectors";
import { getIsNavbarOpen, type RouterProps } from "metabase/selectors/app";
import { isWithinIframe } from "metabase/utils/iframe";

const mock = (fn: unknown) => fn as jest.Mock;

type Flags = {
  embedded: boolean;
  top_nav: boolean;
  search: boolean;
  new_button: boolean;
  logo: boolean;
  side_nav: boolean;
  currentUser: boolean;
  lineage: boolean;
  collection: boolean;
  editingDashboard: boolean;
  fullscreen: boolean;
};

const DEFAULTS: Flags = {
  embedded: true,
  top_nav: true,
  side_nav: true,
  currentUser: true,
  search: false,
  new_button: false,
  logo: false,
  lineage: false,
  collection: false,
  editingDashboard: false,
  fullscreen: false,
};

// A question route matches both the question-lineage and collection-breadcrumb
// path patterns, so `lineage` / `collection` are driven purely by the mocked
// selectors. (admin / data-studio / no-navbar routes don't occur inside an
// embed, so they are intentionally out of scope.)
const PATHNAME = "/question/1-foo";

function setup(overrides: Partial<Flags> = {}) {
  const flags = { ...DEFAULTS, ...overrides };

  mock(isWithinIframe).mockReturnValue(flags.embedded);
  mock(getIsEditing).mockReturnValue(flags.editingDashboard);
  mock(getIsSavedQuestionChanged).mockReturnValue(flags.lineage);
  mock(getQuestion).mockReturnValue(
    flags.collection
      ? { isSaved: () => true, collectionId: () => 1 }
      : undefined,
  );
  mock(getDashboard).mockReturnValue(undefined);
  mock(getCurrentDocument).mockReturnValue(null);

  const hash = flags.fullscreen ? "#fullscreen" : "";
  window.location.hash = hash;

  const state = {
    currentUser: flags.currentUser ? { id: 1 } : null,
    embed: {
      options: {
        top_nav: flags.top_nav,
        side_nav: flags.side_nav,
        search: flags.search,
        new_button: flags.new_button,
        logo: flags.logo,
        breadcrumbs: true,
      },
    },
    app: { isNavbarOpen: false },
  } as unknown as State;
  const props = { location: { pathname: PATHNAME, hash } } as RouterProps;

  return { state, props, flags };
}

// Every boolean input getIsAppBarVisible depends on; `embedded` is held true.
const SWEPT_FLAGS = [
  "top_nav",
  "search",
  "new_button",
  "logo",
  "side_nav",
  "currentUser",
  "lineage",
  "collection",
  "editingDashboard",
  "fullscreen",
] as const satisfies readonly (keyof Flags)[];

function eachCombination(run: (overrides: Partial<Flags>) => void) {
  for (let bits = 0; bits < 1 << SWEPT_FLAGS.length; bits++) {
    const overrides = Object.fromEntries(
      SWEPT_FLAGS.map((flag, i) => [flag, Boolean(bits & (1 << i))]),
    ) as Partial<Flags>;
    run(overrides);
  }
}

afterEach(() => {
  jest.clearAllMocks();
  window.location.hash = "";
});

describe("getIsNavbarOpen embedded force-open guard", () => {
  it("matches !getIsAppBarVisible wherever the navbar renders", () => {
    const mismatches: string[] = [];
    let renderedCount = 0;
    let forcedOpenCount = 0;

    eachCombination((overrides) => {
      const { state, props, flags } = setup(overrides);

      // The value is only observable when the navbar actually renders.
      if (!getIsNavBarEnabled(state, props)) {
        return;
      }
      renderedCount += 1;

      // Oracle: original behaviour, via the real app-tier getIsAppBarVisible.
      const oracle = flags.side_nav && !getIsAppBarVisible(state, props);
      // Subject: the reworked, feature-free guard (stored isNavbarOpen = false).
      const subject = getIsNavbarOpen(state);

      if (subject !== oracle) {
        mismatches.push(
          `${JSON.stringify(flags)} → subject=${subject}, oracle=${oracle}`,
        );
      }
      forcedOpenCount += oracle ? 1 : 0;
    });

    expect(mismatches).toEqual([]);
    // Guard against a vacuous pass: the sweep exercised the guard both ways.
    expect(renderedCount).toBeGreaterThan(0);
    expect(forcedOpenCount).toBeGreaterThan(0);
  });
});

describe("getIsNavbarOpen headline cases", () => {
  it("forces open when embedded with side_nav and the top bar is off", () => {
    const { state } = setup({ top_nav: false });
    expect(getIsNavbarOpen(state)).toBe(true);
  });

  it("forces open when embedded with side_nav in fullscreen even if top_nav is on", () => {
    const { state } = setup({ top_nav: true, fullscreen: true });
    expect(getIsNavbarOpen(state)).toBe(true);
  });

  it("does not force open when the top bar is visible and not fullscreen", () => {
    const { state } = setup({ top_nav: true, fullscreen: false });
    expect(getIsNavbarOpen(state)).toBe(false); // stored value
  });

  it("returns the stored value when not embedded", () => {
    const { state } = setup({ embedded: false, top_nav: false });
    expect(getIsNavbarOpen(state)).toBe(false); // stored value, guard skipped
  });
});
