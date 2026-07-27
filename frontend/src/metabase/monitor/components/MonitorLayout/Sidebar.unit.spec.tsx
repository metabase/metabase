import type { ReactNode } from "react";
import type { ResizableProps } from "react-resizable";

import { renderWithProviders, screen, within } from "__support__/ui";

import { MonitorContent } from "./MonitorContent";
import { Sidebar } from "./Sidebar";

let latestResizableBoxProps: ResizableProps | null = null;

jest.mock("react-resizable", () => ({
  ResizableBox: (props: ResizableProps) => {
    latestResizableBoxProps = props;
    return <div data-testid="resizable-box">{props.children}</div>;
  },
}));

// AppSwitcher pulls in redux/settings the Sidebar behavior doesn't need.
jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => null,
}));

function setup(sidebar: ReactNode) {
  return renderWithProviders(<MonitorContent>{sidebar}</MonitorContent>);
}

describe("Sidebar", () => {
  beforeEach(() => {
    latestResizableBoxProps = null;
  });

  it("portals resizable content into the sidebar region at the default width", () => {
    setup(
      <Sidebar containerWidth={1000}>
        <div data-testid="sidebar-content">{"Sidebar"}</div>
      </Sidebar>,
    );

    const resizableBox = screen.getByTestId("resizable-box");
    expect(screen.getByTestId("monitor-sidebar-region")).toContainElement(
      resizableBox,
    );
    expect(
      within(resizableBox).getByTestId("sidebar-content"),
    ).toBeInTheDocument();
    expect(latestResizableBoxProps?.width).toBe(512);
  });

  it("uses the provided default width", () => {
    setup(
      <Sidebar containerWidth={1000} defaultWidth={560}>
        <div data-testid="sidebar-content">{"Sidebar"}</div>
      </Sidebar>,
    );

    expect(latestResizableBoxProps?.width).toBe(560);
  });

  it("renders content directly without the resizable box when resizable is false", () => {
    setup(
      <Sidebar resizable={false}>
        <div data-testid="sidebar-content">{"Sidebar"}</div>
      </Sidebar>,
    );

    expect(
      within(screen.getByTestId("monitor-sidebar-region")).getByTestId(
        "sidebar-content",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("resizable-box")).not.toBeInTheDocument();
  });
});
