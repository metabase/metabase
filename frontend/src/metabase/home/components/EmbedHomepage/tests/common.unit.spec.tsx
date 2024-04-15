import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("EmbedHomepage (OSS)", () => {
  it("should default to the static tab for OSS builds", () => {
    setup();
    expect(
      screen.getByText("Use static embedding", { exact: false }),
    ).toBeInTheDocument();

    // making sure Tabs isn't just rendering both tabs, making the test always pass
    expect(
      screen.queryByText("Use interactive embedding", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should link to the docs", () => {
    setup();
    expect(screen.getByText("Learn more")).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/static-embedding.html",
    );
  });

  it("should link to the example dashboard if `example-dashboard-id` is set", () => {
    setup({ settings: { "example-dashboard-id": 1 } });

    expect(
      screen.getByText("Select a question", { exact: false }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /Embed this example dashboard/i,
      }),
    ).toHaveAttribute("href", "/dashboard/1");
  });

  it("should prompt to create a question if `example-dashboard-id` is not set", () => {
    setup({ settings: { "example-dashboard-id": null } });

    expect(
      screen.getByText("Create a question", { exact: false }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "Embed this example dashboard",
      }),
    ).not.toBeInTheDocument();
  });

  it("should prompt to enable embedding if it wasn't auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": false } });

    expect(
      screen.getByText("Enable embedding in the settings"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Embedding has been automatically enabled for you"),
    ).not.toBeInTheDocument();
  });

  it("should not prompt to enable embedding if it was auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": true } });

    expect(
      screen.queryByText("Enable embedding in the settings"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Embedding has been automatically enabled for you"),
    ).toBeInTheDocument();
  });

  it("should set 'embedding-homepage' to 'dismissed-done' when dismissing as done", async () => {
    setup();
    await userEvent.hover(screen.getByText("Hide these"));

    await userEvent.click(screen.getByText("Embedding done, all good"));

    const lastCall = fetchMock.lastCall(
      "path:/api/setting/embedding-homepage",
      {
        method: "PUT",
      },
    );

    const body = await lastCall?.request?.json();
    expect(body).toEqual({ value: "dismissed-done" });
  });
});
