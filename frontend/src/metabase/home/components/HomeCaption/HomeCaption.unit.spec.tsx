import { render, screen } from "__support__/ui";

import { HomeCaption } from "./HomeCaption";

const setup = () => {
  render(<HomeCaption>Title</HomeCaption>);
};

describe("HomeCaption", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });
});
