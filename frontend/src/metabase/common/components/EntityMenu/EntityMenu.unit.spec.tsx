import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getIcon, render, screen } from "__support__/ui";
import { EntityMenu } from "metabase/common/components/EntityMenu";

const openDefaultMenu = async () => {
  await userEvent.click(getIcon("ellipsis"));
};

describe("EntityMenu", () => {
  it("opens with the default ellipsis trigger", async () => {
    render(
      <EntityMenu
        items={[{ title: "Default action", icon: "pencil", action: jest.fn() }]}
      />,
    );

    await openDefaultMenu();

    expect(await screen.findByText("Default action")).toBeInTheDocument();
  });

  it("calls action items and closes the menu", async () => {
    const action = jest.fn();

    render(
      <EntityMenu items={[{ title: "Archive", icon: "archive", action }]} />,
    );

    await openDefaultMenu();
    await userEvent.click(await screen.findByText("Archive"));

    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    });
  });

  it("renders internal link items", async () => {
    render(
      <EntityMenu items={[{ title: "Open", icon: "link", link: "/derp" }]} />,
    );

    await openDefaultMenu();

    const link = await screen.findByTestId("entity-menu-link");
    expect(link).toHaveTextContent("Open");
  });

  it("does not call disabled action items", async () => {
    const action = jest.fn();

    render(
      <EntityMenu
        items={[{ title: "Disabled", icon: "archive", action, disabled: true }]}
      />,
    );

    await openDefaultMenu();
    await userEvent.click(await screen.findByText("Disabled"));

    expect(action).not.toHaveBeenCalled();
  });

  it("ignores null items", async () => {
    render(
      <EntityMenu
        items={[null, { title: "Visible action", action: jest.fn() }]}
      />,
    );

    await openDefaultMenu();

    expect(await screen.findByText("Visible action")).toBeInTheDocument();
  });

  it("opens with a custom trigger element", async () => {
    render(
      <EntityMenu
        trigger={<button type="button">Custom trigger</button>}
        items={[{ title: "Custom action", action: jest.fn() }]}
      />,
    );

    await userEvent.click(screen.getByText("Custom trigger"));

    expect(await screen.findByText("Custom action")).toBeInTheDocument();
  });

  it("passes open state and click handler to renderTrigger", async () => {
    render(
      <EntityMenu
        renderTrigger={({ open, onClick }) => (
          <button type="button" onClick={onClick}>
            {open ? "Open" : "Closed"}
          </button>
        )}
        items={[{ title: "Rendered action", action: jest.fn() }]}
      />,
    );

    expect(screen.getByText("Closed")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Closed"));

    expect(await screen.findByText("Open")).toBeInTheDocument();
  });

  it("applies trigger aria label and trigger props", () => {
    render(
      <EntityMenu
        triggerAriaLabel="Actions"
        triggerProps={{ "data-testid": "actions-trigger" }}
        items={[{ title: "Action", action: jest.fn() }]}
      />,
    );

    expect(screen.getByLabelText("Actions")).toBeInTheDocument();
    expect(screen.getByTestId("actions-trigger")).toBeInTheDocument();
  });
});
