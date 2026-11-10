import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { ChannelCard } from "./ChannelCard";

type SetupOpts = {
  title?: string;
  to?: string;
};

function setup({ title = "Email it", to }: SetupOpts = {}) {
  const onClick = jest.fn<void, []>();

  renderWithProviders(
    to === undefined ? (
      <ChannelCard title={title} channel="email" onClick={onClick} />
    ) : (
      <ChannelCard title={title} channel="email" to={to} />
    ),
  );

  return { onClick };
}

describe("ChannelCard", () => {
  it("should be a button that the Tab key reaches (metabase#85242)", async () => {
    setup();

    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Email it" })).toHaveFocus();
  });

  it("should call onClick when Enter or Space is pressed (metabase#85242)", async () => {
    const { onClick } = setup();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("should be a link that the Tab key reaches when it has a target", async () => {
    setup({ title: "Set up email", to: "/admin/settings/email" });

    await userEvent.tab();

    const link = screen.getByRole("link", { name: "Set up email" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "/admin/settings/email");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
