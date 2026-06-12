import type { State } from "metabase/redux/store";

// getIsNavbarOpen (shared) uses a feature-free proxy (`!top_nav || fullscreen`)
// for "the app bar is hidden", instead of the app-tier getIsAppBarVisible which
// reads dashboard/query_builder state. This test proves the proxy is exactly
// equivalent to the real getIsAppBarVisible wherever the result is observable
// (i.e. wherever the navbar actually renders). We mock the *feature leaf*
// selectors so we can sweep lineage/collection/editing freely while the real
// getIsAppBarVisible composition (suppressors, the element OR, the top_nav gate)
// runs unmocked.

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

const asMock = (fn: unknown) => fn as jest.Mock;

type Combo = {
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

const DIMENSIONS: (keyof Combo)[] = [
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
];

// A question route matches both the lineage and collection-breadcrumb path
// patterns, so lineage/collection are driven purely by the mocked selectors.
// (admin / data-studio / no-navbar routes don't occur inside an embed, so they
// are intentionally out of scope here.)
const PATHNAME = "/question/1-foo";

const buildCombo = (bits: number): Combo =>
  DIMENSIONS.reduce(
    (acc, dim, i) => ({ ...acc, [dim]: Boolean(bits & (1 << i)) }),
    {} as Combo,
  );

const applyCombo = (c: Combo): { state: State; props: RouterProps } => {
  asMock(isWithinIframe).mockReturnValue(true); // matrix is the embedded case
  asMock(getIsEditing).mockReturnValue(c.editingDashboard);
  asMock(getIsSavedQuestionChanged).mockReturnValue(c.lineage);
  asMock(getQuestion).mockReturnValue(
    c.collection ? { isSaved: () => true, collectionId: () => 1 } : undefined,
  );
  asMock(getDashboard).mockReturnValue(undefined);
  asMock(getCurrentDocument).mockReturnValue(null);

  const hash = c.fullscreen ? "#fullscreen" : "";
  window.location.hash = hash;

  const state = {
    currentUser: c.currentUser ? { id: 1 } : null,
    embed: {
      options: {
        top_nav: c.top_nav,
        side_nav: c.side_nav,
        search: c.search,
        new_button: c.new_button,
        logo: c.logo,
        breadcrumbs: true,
      },
    },
    app: { isNavbarOpen: false },
  } as unknown as State;

  const props = { location: { pathname: PATHNAME, hash } } as RouterProps;

  return { state, props };
};

afterEach(() => {
  jest.clearAllMocks();
  window.location.hash = "";
});

describe("getIsNavbarOpen embedded force-open guard", () => {
  it("is exactly equivalent to !getIsAppBarVisible wherever the navbar renders", () => {
    const mismatches: string[] = [];
    let asserted = 0;
    let fired = 0;

    for (let bits = 0; bits < 1 << DIMENSIONS.length; bits++) {
      const c = buildCombo(bits);
      const { state, props } = applyCombo(c);

      // The navbar value is only observable when the navbar actually renders.
      if (!getIsNavBarEnabled(state, props)) {
        continue;
      }
      asserted++;

      // Oracle: the original behaviour, via the REAL app-tier getIsAppBarVisible.
      const oracle = c.side_nav && !getIsAppBarVisible(state, props);
      // Subject: the reworked, feature-free guard (stored isNavbarOpen = false).
      const subject = getIsNavbarOpen(state);

      if (subject !== oracle) {
        mismatches.push(
          `${JSON.stringify(c)} → subject=${subject} oracle=${oracle}`,
        );
      }
      if (oracle) {
        fired++;
      }
    }

    expect(mismatches).toEqual([]);
    // sanity: the matrix actually exercised the guard, both ways
    expect(asserted).toBeGreaterThan(0);
    expect(fired).toBeGreaterThan(0);
  });
});

describe("getIsNavbarOpen headline cases", () => {
  const base: Combo = {
    top_nav: true,
    search: false,
    new_button: false,
    logo: false,
    side_nav: true,
    currentUser: true,
    lineage: false,
    collection: false,
    editingDashboard: false,
    fullscreen: false,
  };

  it("forces open when embedded with side_nav and the top bar is off", () => {
    const { state } = applyCombo({ ...base, top_nav: false });
    expect(getIsNavbarOpen(state)).toBe(true);
  });

  it("forces open when embedded with side_nav in fullscreen even if top_nav is on", () => {
    const { state } = applyCombo({ ...base, top_nav: true, fullscreen: true });
    expect(getIsNavbarOpen(state)).toBe(true);
  });

  it("does not force open when the top bar is visible and not fullscreen", () => {
    const { state } = applyCombo({ ...base, top_nav: true, fullscreen: false });
    expect(getIsNavbarOpen(state)).toBe(false); // stored value
  });

  it("returns the stored value when not embedded", () => {
    asMock(isWithinIframe).mockReturnValue(false);
    const state = {
      currentUser: { id: 1 },
      embed: { options: { side_nav: true, top_nav: false } },
      app: { isNavbarOpen: false },
    } as unknown as State;
    expect(getIsNavbarOpen(state)).toBe(false);
  });
});
