import React from "react";
import { render, screen, waitForElementToBeRemoved } from "__support__/ui";
import xhrMock from "xhr-mock";

import RootCollectionLink from "./RootCollectionLink";

async function setup() {
  render(<RootCollectionLink isRoot={false} />, { withDND: true });
  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
}

describe("RootCollectionLink", () => {
  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/collection/root", {
      body: JSON.stringify({
        id: "root",
        name: "Our analytics",
      }),
    });
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("displays link to root collection", async () => {
    await setup();
    screen.getByText("Our analytics");
  });
});
