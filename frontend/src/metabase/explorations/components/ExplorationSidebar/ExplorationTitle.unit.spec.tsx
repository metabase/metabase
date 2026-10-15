import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createExploration } from "metabase/explorations/test-utils";

import { ExplorationTitle } from "./ExplorationTitle";

function setup({
  canWrite = true,
  isSidebarOpen = true,
}: {
  canWrite?: boolean;
  isSidebarOpen?: boolean;
} = {}) {
  const setIsSidebarOpen = jest.fn();
  const exploration = createExploration();
  exploration.can_write = canWrite;

  renderWithProviders(
    <ExplorationTitle
      exploration={exploration}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
    />,
    { withUndos: true },
  );

  return { exploration, setIsSidebarOpen };
}

describe("ExplorationTitle", () => {
  it("renders the exploration name", () => {
    setup();
    expect(screen.getByRole("textbox")).toHaveValue("My exploration");
  });

  it("updates the exploration name when edited", async () => {
    const { exploration } = setup();
    fetchMock.put(`path:/api/exploration/${exploration.id}`, {
      ...exploration,
      name: "Renamed exploration",
    });

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed exploration");
    await userEvent.tab();

    await waitFor(async () => {
      const lastCall = fetchMock.callHistory.lastCall(
        `path:/api/exploration/${exploration.id}`,
      );
      expect(await lastCall?.request?.json()).toEqual({
        name: "Renamed exploration",
      });
    });
  });

  it("disables name editing when the user cannot write", () => {
    setup({ canWrite: false });
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("toggles the sidebar when the button is clicked", async () => {
    const { setIsSidebarOpen } = setup();
    await userEvent.click(screen.getByTestId("exploration-sidebar-toggle"));
    expect(setIsSidebarOpen).toHaveBeenCalledWith(false);
  });

  it("shows a toast when the name update fails", async () => {
    const { exploration } = setup();
    fetchMock.put(`path:/api/exploration/${exploration.id}`, 500);

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed exploration");
    await userEvent.tab();

    expect(
      await screen.findByText("Failed to update name"),
    ).toBeInTheDocument();
  });
});
