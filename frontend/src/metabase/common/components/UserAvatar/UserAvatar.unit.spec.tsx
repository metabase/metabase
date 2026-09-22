import { render, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  it("renders a generated image labelled with the user's name", () => {
    render(
      <UserAvatar
        user={createMockUser({
          first_name: "Testy",
          last_name: "Tableton",
          common_name: "Testy Tableton",
          email: "user@metabase.test",
        })}
      />,
    );

    const avatar = screen.getByRole("img", { name: "Testy Tableton" });
    expect(avatar).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
  });

  it("falls back to the email when the user has no name", () => {
    render(
      <UserAvatar
        user={createMockUser({
          first_name: null,
          last_name: null,
          common_name: "user@metabase.test",
          email: "user@metabase.test",
        })}
      />,
    );

    expect(
      screen.getByRole("img", { name: "user@metabase.test" }),
    ).toBeInTheDocument();
  });

  it("labels a group by its name", () => {
    render(<UserAvatar user={{ name: "Administrators" }} />);

    expect(
      screen.getByRole("img", { name: "Administrators" }),
    ).toBeInTheDocument();
  });

  it("gives different people different images and one person a stable image", () => {
    const testy = createMockUser({ common_name: "Testy Tableton" });
    const bobby = createMockUser({ common_name: "Bobby Tables" });

    render(
      <>
        <UserAvatar user={testy} />
        <UserAvatar user={bobby} />
        <UserAvatar user={testy} />
      </>,
    );

    const [first, second, third] = screen
      .getAllByRole("img")
      .map((image) => image.getAttribute("src"));

    expect(first).not.toEqual(second);
    expect(first).toEqual(third);
  });

  it("hides a decorative avatar from the accessibility tree", () => {
    render(
      <UserAvatar
        user={createMockUser({ common_name: "Testy Tableton" })}
        decorative
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
