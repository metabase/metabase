import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionSecretsEndpoints,
  setupActionTemplateCategoriesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { ActionSecret } from "metabase-types/api";
import {
  createMockActionSecret,
  createMockActionTemplateCategory,
} from "metabase-types/api/mocks";

import { ActionTemplateModal } from "./ActionTemplateModal";

type SetupOpts = {
  secrets: ActionSecret[];
};

function setup({ secrets }: SetupOpts) {
  setupActionSecretsEndpoints(secrets);
  setupActionTemplateCategoriesEndpoint([createMockActionTemplateCategory()]);
  renderWithProviders(
    <>
      <Route
        path="/data-studio/actions"
        element={<ActionTemplateModal onClose={jest.fn()} />}
      />
      <Route path="*" element={<div data-testid="new-action-page" />} />
    </>,
    { withRouter: true, initialRoute: "/data-studio/actions" },
  );
}

async function pickTemplate() {
  await userEvent.click(await screen.findByText("Create an issue"));
}

describe("ActionTemplateModal", () => {
  it("opens template right away when its secrets exist", async () => {
    setup({ secrets: [createMockActionSecret({ name: "github_token" })] });

    await pickTemplate();

    expect(await screen.findByTestId("new-action-page")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("action-secret-post")).toBe(false);
  });

  it("asks for missing secrets, creates them, and opens template", async () => {
    setup({ secrets: [] });

    await pickTemplate();
    const dialog = await screen.findByRole("dialog", { name: "Add secrets" });
    await userEvent.type(
      within(dialog).getByLabelText("GitHub token"),
      "token-123",
    );
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Create secrets and continue",
      }),
    );

    expect(await screen.findByTestId("new-action-page")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.callHistory.called("action-secret-post")).toBe(true),
    );
    expect(
      await fetchMock.callHistory
        .lastCall("action-secret-post")
        ?.request?.json(),
    ).toEqual({
      name: "github_token",
      value: "token-123",
      allowed_hosts: ["api.github.com"],
    });
  });

  it("goes back to templates from missing secrets", async () => {
    setup({ secrets: [] });

    await pickTemplate();
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));

    expect(await screen.findByText("Create an issue")).toBeInTheDocument();
  });
});
