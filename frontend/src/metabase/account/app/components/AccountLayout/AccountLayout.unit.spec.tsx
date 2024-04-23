import { render, screen } from "@testing-library/react";

import { createMockUser } from "metabase-types/api/mocks";

import { AccountLayout } from "./AccountLayout";

const getUser = () =>
  createMockUser({
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
