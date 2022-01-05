import React from "react";
import { render, screen } from "@testing-library/react";
import { createUser } from "metabase-types/api";
import GreetingSection from "./GreetingSection";

describe("GreetingSection", () => {
  it("should display a personal greeting", () => {
    const user = createUser({ first_name: "John" });

    render(<GreetingSection user={user} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
  });
});
