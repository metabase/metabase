import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("DashboardHeader", () => {
  it("should render dashboard title heading with aria-level (#70544)", async () => {
    await setup({});

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
  });
});
