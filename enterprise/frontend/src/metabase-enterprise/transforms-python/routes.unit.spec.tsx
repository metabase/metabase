// The common-library link is a CodeMirror decoration, so the real editor is needed.
jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { lazyLoaders } from "__support__/lazy-routes";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { getPythonTransformsRoutes, getPythonUpsellRoutes } from "./routes";

describe("python transform routes", () => {
  it("resolves every page", async () => {
    const loaders = [
      ...lazyLoaders(getPythonTransformsRoutes()),
      ...lazyLoaders(getPythonUpsellRoutes()),
    ];

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  describe("common library link in a new python transform", () => {
    const NEW_PYTHON_TRANSFORM_URL = "/data-studio/transforms/new/python";
    const COMMON_LIBRARY_URL = "/data-studio/transforms/library/common.py";
    const COMMON_LIBRARY_API_URL =
      "path:/api/ee/transforms-python/library/common.py";

    function setup() {
      const state = createMockState({
        settings: mockSettings({
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures({
            transforms: true,
            "transforms-python": true,
          }),
        }),
      });
      setupEnterprisePlugins();

      setupDatabasesEndpoints([
        createMockDatabase({ id: 1, transforms_permissions: "write" }),
      ]);
      setupSearchEndpoints([]);
      fetchMock.get(COMMON_LIBRARY_API_URL, {
        path: "common.py",
        source: "# shared code\n",
      });

      const { router } = renderWithProviders(
        <Route path="/data-studio/transforms">
          {getPythonTransformsRoutes()}
        </Route>,
        {
          storeInitialState: state,
          withRouter: true,
          initialRoute: NEW_PYTHON_TRANSFORM_URL,
        },
      );

      return { router, user: userEvent.setup() };
    }

    function getClickableTokens() {
      return Array.from(
        // The token is a CodeMirror mark decoration: it has only a class name,
        // no role, label or test id to query by.
        // eslint-disable-next-line testing-library/no-node-access
        document.querySelectorAll<HTMLElement>(".cm-clickable-token"),
      );
    }

    async function findCommonToken() {
      await waitFor(() => expect(getClickableTokens()).toHaveLength(1));
      const [token] = getClickableTokens();
      // Only `common` in `import common` is a link, not `pandas` or `pd`.
      expect(token).toHaveTextContent(/^common$/);
      return token;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(["Meta", "Control"])(
      "opens the common library in a new tab on %s-click",
      async (modifier) => {
        const windowOpen = jest.spyOn(window, "open").mockReturnValue(null);
        const { router, user } = setup();
        const token = await findCommonToken();

        await user.keyboard(`{${modifier}>}`);
        await user.click(token);
        await user.keyboard(`{/${modifier}}`);

        expect(windowOpen).toHaveBeenCalledTimes(1);
        expect(windowOpen).toHaveBeenCalledWith(
          COMMON_LIBRARY_URL,
          "_blank",
          "noopener,noreferrer",
        );
        expect(router?.location.pathname).toBe(NEW_PYTHON_TRANSFORM_URL);
        expect(
          screen.queryByRole("dialog", { name: "Discard your changes?" }),
        ).not.toBeInTheDocument();
      },
    );

    it("navigates to the common library on click after discarding changes", async () => {
      const windowOpen = jest.spyOn(window, "open").mockReturnValue(null);
      const { router, user } = setup();

      await user.click(await findCommonToken());

      const modal = await screen.findByRole("dialog", {
        name: "Discard your changes?",
      });
      expect(router?.location.pathname).toBe(NEW_PYTHON_TRANSFORM_URL);
      await user.click(
        within(modal).getByRole("button", { name: "Discard changes" }),
      );

      const header = await screen.findByTestId("python-library-header");
      // breadcrumb and title
      expect(within(header).getAllByText("Python library")).toHaveLength(2);
      expect(await screen.findByTestId("python-editor")).toHaveTextContent(
        "# shared code",
      );
      expect(router?.location.pathname).toBe(COMMON_LIBRARY_URL);
      expect(fetchMock.callHistory.called(COMMON_LIBRARY_API_URL)).toBe(true);
      expect(windowOpen).not.toHaveBeenCalled();
    });
  });
});
