import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Menu } from "metabase/ui";

function renderMenuItem(softDisabled = false) {
  const onRowClick = jest.fn();
  const onRightClick = jest.fn();

  render(
    <Menu opened withinPortal={false}>
      <Menu.Dropdown>
        <Menu.Item
          data-testid="menu-item"
          onClick={onRowClick}
          softDisabled={softDisabled}
          rightSection={
            <a
              href="/admin/settings/public-sharing"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="enable"
              onClick={(e) => {
                e.preventDefault();
                onRightClick();
              }}
            >
              Enable
            </a>
          }
        >
          Public link
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>,
  );

  const row = screen.getByTestId("menu-item");
  const enableEl = screen.getByTestId("enable");
  return { row, enableEl, onRowClick, onRightClick };
}

describe("MenuItem (softDisabled)", () => {
  it("suppresses row click but keeps rightSection interactive when softDisabled", async () => {
    const { row, enableEl, onRowClick, onRightClick } = renderMenuItem(true);

    await userEvent.click(row);
    expect(onRowClick).not.toHaveBeenCalled();

    await userEvent.click(enableEl);
    expect(onRightClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("fires onClick when not softDisabled", async () => {
    const { row, onRowClick } = renderMenuItem(false);

    await userEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire row onClick when softDisabled and clicking leftSection", async () => {
    const onRowClick = jest.fn();

    render(
      <Menu opened withinPortal={false}>
        <Menu.Dropdown>
          <Menu.Item
            data-testid="menu-item"
            onClick={onRowClick}
            softDisabled
            leftSection={<span data-testid="left">L</span>}
            rightSection={<a data-testid="enable">Enable</a>}
          >
            Public link
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>,
    );

    await userEvent.click(screen.getByTestId("left"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("sets aria-disabled when softDisabled", () => {
    const { row } = renderMenuItem(true);
    expect(row).toHaveAttribute("aria-disabled", "true");
  });

  it("does not set aria-disabled when not softDisabled", () => {
    const { row } = renderMenuItem(false);
    expect(row).not.toHaveAttribute("aria-disabled");
  });
});
