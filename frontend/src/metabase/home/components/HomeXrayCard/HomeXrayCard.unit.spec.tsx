import { render, screen } from "__support__/ui";

import { HomeXrayCard } from "./HomeXrayCard";

interface SetupOpts {
  title: string;
  message: string;
  url: string;
}

const setup = ({ title, message, url }: SetupOpts) => {
  render(<HomeXrayCard title={title} message={message} url={url} />);
};

describe("HomeXrayCard", () => {
  it("should render correctly", () => {
    setup({
      title: "Orders",
      message: "A look at",
      url: "/question/1",
    });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("A look at")).toBeInTheDocument();
  });
});
