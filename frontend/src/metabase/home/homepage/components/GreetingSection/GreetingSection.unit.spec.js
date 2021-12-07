import React from "react";
import { render, screen } from "@testing-library/react";
import GreetingSection from "./GreetingSection";

describe("GreetingSection", () => {
  it("should display a personal greeting", () => {
    const user = getUser({ first_name: "John" });

    render(<GreetingSection user={user} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
  });
});

const getUser = ({ first_name } = {}) => ({ first_name });
