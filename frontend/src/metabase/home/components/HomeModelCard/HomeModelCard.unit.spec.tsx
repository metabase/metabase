import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/hoc/Title";

import type { HomeModelIconProps } from "./HomeModelCard";
import { HomeModelCard } from "./HomeModelCard";

interface SetupOpts {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

const setup = ({ title, icon, url }: SetupOpts) => {
  renderWithProviders(
    <Route
      path="/"
      component={() => <HomeModelCard title={title} icon={icon} url={url} />}
    ></Route>,
    {
      withRouter: true,
    },
  );
};

describe("HomeModelCard", () => {
  it("should render correctly", () => {
    setup({
      title: "Orders",
      icon: { name: "table" },
      url: "/question/1",
    });

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("table icon")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/question/1");
  });
});
