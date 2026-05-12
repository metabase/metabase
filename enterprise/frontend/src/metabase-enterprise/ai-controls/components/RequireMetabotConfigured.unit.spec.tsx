import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";

import { RequireMetabotConfigured } from "./RequireMetabotConfigured";

const SUB_PAGE_PATH = "/admin/metabot/1/usage-controls/ai-usage-limits";
const INDEX_PATH = "/admin/metabot/";

function setup({ configured }: { configured: boolean }) {
  return renderWithProviders(
    <>
      <Route component={RequireMetabotConfigured}>
        <Route
          path={SUB_PAGE_PATH}
          component={() => <div>SUB PAGE CONTENT</div>}
        />
      </Route>
      <Route path={INDEX_PATH} component={() => <div>METABOT INDEX</div>} />
    </>,
    {
      withRouter: true,
      initialRoute: SUB_PAGE_PATH,
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": configured,
        }),
      },
    },
  );
}

describe("RequireMetabotConfigured", () => {
  it("redirects to the AI settings index when AI is not configured", async () => {
    const { history } = setup({ configured: false });

    expect(await screen.findByText("METABOT INDEX")).toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(INDEX_PATH);
  });

  it("renders the requested sub-page when AI is configured", async () => {
    const { history } = setup({ configured: true });

    expect(await screen.findByText("SUB PAGE CONTENT")).toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(SUB_PAGE_PATH);
  });
});
