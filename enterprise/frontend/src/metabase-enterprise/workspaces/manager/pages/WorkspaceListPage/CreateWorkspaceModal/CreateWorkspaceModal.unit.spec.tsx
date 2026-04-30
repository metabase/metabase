import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCreateWorkspaceEndpoint,
  setupCreateWorkspaceEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Urls from "metabase/utils/urls";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";

type SetupOpts = {
  withError?: boolean;
};

function setup({ withError = false }: SetupOpts = {}) {
  const onClose = jest.fn();

  if (withError) {
    setupCreateWorkspaceEndpointError(400, "Name already taken");
  } else {
    setupCreateWorkspaceEndpoint(
      createMockWorkspace({ id: 42, name: "Acme analytics" }),
    );
  }

  const utils = renderWithProviders(
    <Route
      path="/"
      component={() => <CreateWorkspaceModal opened onClose={onClose} />}
    />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );
  return { ...utils, onClose };
}

describe("CreateWorkspaceModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should block submission and show the required-field error when name is empty", async () => {
    setup();

    expect(
      screen.getByRole("textbox", { name: /Name/i }),
    ).toHaveValue("");

    const submit = screen.getByRole("button", { name: /Create/i });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("textbox", { name: /Name/i }));
    await userEvent.tab();

    expect(await screen.findByText("required")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/workspace-manager"),
    ).toHaveLength(0);
  });

  it("should submit a trimmed name, close the modal, and navigate to the new workspace", async () => {
    const { onClose, history } = setup();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Name/i }),
      "  Acme analytics  ",
    );
    await userEvent.click(screen.getByRole("button", { name: /Create/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const [request] = fetchMock.callHistory.calls(
      "path:/api/ee/workspace-manager",
    );
    expect(request).toBeDefined();
    expect(await request.request?.json()).toEqual({ name: "Acme analytics" });

    expect(history?.getCurrentLocation().pathname).toBe(Urls.workspace(42));
  });

  it("should surface the BE error message and keep the modal open when create fails", async () => {
    const { onClose } = setup({ withError: true });

    await userEvent.type(
      screen.getByRole("textbox", { name: /Name/i }),
      "Acme",
    );
    await userEvent.click(screen.getByRole("button", { name: /Create/i }));

    expect(await screen.findByText(/Name already taken/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
