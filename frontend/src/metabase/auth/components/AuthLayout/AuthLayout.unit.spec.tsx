import React from "react";
import AuthLayout from "./AuthLayout";
import { render, screen } from "@testing-library/react";

describe("AuthLayout", () => {
  it("should render the auth scene if enabled", () => {
    render(<AuthLayout showScene={true} />);

    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("should no render the auth scene if not enabled", () => {
    render(<AuthLayout showScene={false} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
