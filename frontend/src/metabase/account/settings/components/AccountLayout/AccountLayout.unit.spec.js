import React from "react";
import { render, screen } from "@testing-library/react";
import AccountLayout from "./AccountLayout";

const REGULAR_USER = {
  id: 1,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
};

describe("AccountLayout", () => {
  it("should render header and content", () => {
    render(<AccountLayout user={REGULAR_USER}>Content</AccountLayout>);

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
