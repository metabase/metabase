import React from "react";
import { render } from "@testing-library/react";
import Logout from "./Logout";

describe("Logout", () => {
  it("should logout on mount", () => {
    const onLogout = jest.fn();

    render(<Logout onLogout={onLogout} />);

    expect(onLogout).toHaveBeenCalled();
  });
});
