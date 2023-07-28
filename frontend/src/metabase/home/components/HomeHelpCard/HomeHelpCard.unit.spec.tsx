import { render, screen } from "__support__/ui";
import { HomeHelpCard } from "./HomeHelpCard";

const setup = () => {
  render(<HomeHelpCard />);
};

describe("HomeHelpCard", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });
});
