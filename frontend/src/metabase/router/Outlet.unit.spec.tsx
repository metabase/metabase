import { render, screen } from "@testing-library/react";

import { Outlet } from "metabase/router";

describe("router/Outlet", () => {
  it("renders nothing when there is no matched child", () => {
    const { container } = render(<Outlet />);
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
