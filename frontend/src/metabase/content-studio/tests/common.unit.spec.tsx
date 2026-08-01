import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("Content Studio routes (OSS)", () => {
  it("renders the shell with the remote sync upsell", async () => {
    setup();

    expect(await screen.findByTestId("content-studio-nav")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Manage your Metabase content in Git",
      }),
    ).toBeInTheDocument();
  });

  it("renders the upsell for any Content Studio path", async () => {
    setup({ initialRoute: "/content-studio/collections" });

    expect(
      await screen.findByRole("heading", {
        name: "Manage your Metabase content in Git",
      }),
    ).toBeInTheDocument();
  });

  it("redirects non-admins to /unauthorized", async () => {
    setup({ isAdmin: false });

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    expect(screen.queryByTestId("content-studio-nav")).not.toBeInTheDocument();
  });
});
