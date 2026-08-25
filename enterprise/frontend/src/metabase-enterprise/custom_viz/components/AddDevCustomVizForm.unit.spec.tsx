import userEvent from "@testing-library/user-event";
import fetchMock, { type RouteResponse } from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCustomVizPlugin } from "metabase-types/api/mocks";

import { AddDevCustomVizForm } from "./AddDevCustomVizForm";

const DEV_URL = "http://localhost:5174";
const MANIFEST_URL = `${DEV_URL}/metabase-plugin.json`;
const CREATE_URL = "path:/api/ee/custom-viz-plugin/dev";

type SetupOpts = {
  /** What the dev server answers for `metabase-plugin.json`. */
  manifestResponse?: RouteResponse;
};

function setup({
  manifestResponse = { name: "my-viz", icon: "icon.svg" },
}: SetupOpts = {}) {
  fetchMock.get(MANIFEST_URL, manifestResponse);
  fetchMock.post(CREATE_URL, createMockCustomVizPlugin());

  renderWithProviders(<AddDevCustomVizForm />);
}

async function submit() {
  await userEvent.click(screen.getByRole("button", { name: "Enable" }));
}

describe("AddDevCustomVizForm", () => {
  it("registers the plugin with the manifest fetched from the dev server", async () => {
    setup();

    await submit();

    await waitFor(() => {
      expect(fetchMock.callHistory.calls(CREATE_URL)).toHaveLength(1);
    });
    const [call] = fetchMock.callHistory.calls(CREATE_URL);
    expect(JSON.parse(String(call.options.body))).toEqual({
      dev_bundle_url: DEV_URL,
      manifest: { name: "my-viz", icon: "icon.svg" },
    });
  });

  it("says the dev server is unreachable, and registers nothing", async () => {
    setup({ manifestResponse: { throws: new TypeError("Failed to fetch") } });

    await submit();

    expect(
      await screen.findByText("Couldn't reach that dev server. Is it running?"),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(CREATE_URL)).toHaveLength(0);
  });

  it("says the URL is serving something other than a manifest", async () => {
    setup({
      manifestResponse: {
        status: 200,
        body: "<!doctype html><title>vite</title>",
        headers: { "content-type": "text/html" },
      },
    });

    await submit();

    expect(
      await screen.findByText(
        "That URL answered with something other than a plugin manifest.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(CREATE_URL)).toHaveLength(0);
  });
});
