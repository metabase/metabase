import { render, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import AccountLayout from "./AccountLayout";

describe("AccountLayout", () => {
  it("should render header and content", () => {
    const user = createMockUser({
      id: 1,
      first_name: "John",
      last_name: "Doe",
      email: "john@metabase.test",
    });

    render(
      <AccountLayout user={user} onChangeLocation={() => {}}>
        Content
      </AccountLayout>,
    );

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
