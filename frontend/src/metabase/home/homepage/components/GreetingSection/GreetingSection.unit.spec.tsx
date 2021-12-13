import React from "react";
import { render, screen } from "@testing-library/react";
import { User } from "../../types";
import GreetingSection from "./GreetingSection";

describe("GreetingSection", () => {
  it("should display a personal greeting", () => {
    const user = getUser({ first_name: "John" });

    render(<GreetingSection user={user} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "John",
  is_superuser: false,
  personal_collection_id: "personal",
  ...opts,
});
