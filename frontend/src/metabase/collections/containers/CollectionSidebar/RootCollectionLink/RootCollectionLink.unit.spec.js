import React from "react";
import { Provider } from "react-redux";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { getStore } from "__support__/entities-store";
import xhrMock from "xhr-mock";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import RootCollectionLink from "./RootCollectionLink";

async function setup() {
  render(
    <Provider store={getStore()}>
      <DragDropContextProvider backend={HTML5Backend}>
        <RootCollectionLink isRoot={false} />
      </DragDropContextProvider>
    </Provider>,
  );
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
