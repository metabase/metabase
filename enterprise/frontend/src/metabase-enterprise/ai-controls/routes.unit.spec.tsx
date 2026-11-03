import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockSettings } from "metabase-types/api/mocks";

import { getAiControlsRoutes } from "./routes";

interface SetupOpts {
  initialRoute: string;
}

function setup({ initialRoute }: SetupOpts) {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);

  renderWithProviders(
    <Route path="/admin/metabot">{getAiControlsRoutes()}</Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": true,
        }),
      },
    },
  );
}

describe("getAiControlsRoutes", () => {
  it.each([
    {
      path: "/admin/metabot/system-prompts/metabot-chat",
      heading: "AI chat prompt instructions",
    },
    {
      path: "/admin/metabot/system-prompts/natural-language-queries",
      heading: "Natural language query prompt instructions",
    },
    {
      path: "/admin/metabot/system-prompts/sql-generation",
      heading: "SQL generation prompt instructions",
    },
  ])("renders the $heading page at $path", async ({ path, heading }) => {
    setup({ initialRoute: path });

    expect(
      await screen.findByRole("heading", { name: heading, level: 1 }),
    ).toBeInTheDocument();
  });
});
