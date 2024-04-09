import { render, screen } from "@testing-library/react";

import AccountLayout from "./AccountLayout";

const getUser = () => ({
  id: 1,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
});

describe("AccountLayout", () => {
  it("should render header and content", () => {
    const user = getUser();

    render(<AccountLayout user={user}>Content</AccountLayout>);

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
