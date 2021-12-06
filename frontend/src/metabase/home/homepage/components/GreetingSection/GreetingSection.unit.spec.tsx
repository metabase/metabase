import { render, screen } from "@testing-library/react";
import React from "react";
import GreetingSection from "./GreetingSection";

describe("GreetingSection", () => {
  it("should display a personal greeting", () => {
    const user = getUser({ first_name: "John" });

    render(<GreetingSection user={user} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
  });
});

const getUser = ({
  first_name = "",
  is_superuser = false,
  personal_collection_id = "",
} = {}) => ({ first_name, is_superuser, personal_collection_id });
