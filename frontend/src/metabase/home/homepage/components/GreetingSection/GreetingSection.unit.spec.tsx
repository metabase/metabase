import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockUser } from "metabase-types/api/mocks";
import GreetingSection from "./GreetingSection";

describe("GreetingSection", () => {
  it("should display a personal greeting", () => {
    const user = createMockUser({ first_name: "John" });

    render(<GreetingSection user={user} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
  });
});
