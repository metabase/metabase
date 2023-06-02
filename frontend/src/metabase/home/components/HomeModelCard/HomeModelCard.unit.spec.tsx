import { render, screen } from "__support__/ui";
import { HomeModelCard, HomeModelIconProps } from "./HomeModelCard";

interface SetupOpts {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

const setup = ({ title, icon, url }: SetupOpts) => {
  render(<HomeModelCard title={title} icon={icon} url={url} />);
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
  });
});