import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/hoc/Title";

import { HomeXrayCard } from "./HomeXrayCard";

interface SetupOpts {
  title: string;
  message: string;
  url: string;
}

const setup = ({ title, message, url }: SetupOpts) => {
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <HomeXrayCard title={title} message={message} url={url} />
      )}
    ></Route>,
    {
      withRouter: true,
    },
  );
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
    expect(screen.getByRole("link")).toHaveAttribute("href", "/question/1");
  });
});
