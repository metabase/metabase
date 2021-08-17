import React from "react";
import { Provider } from "react-redux";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import xhrMock from "xhr-mock";
import { getStore } from "__support__/entities-store";
import ItemPicker from "./ItemPicker";

function collection({
  id,
  name,
  location = "/",
  personal_owner_id = null,
  can_write = true,
}) {
  return {
    id,
    name,
    location,
    personal_owner_id,
    can_write,
    archived: false,
  };
}

function dashboard({ id, name, collection_id = null }) {
  return {
    id,
    name,
    collection_id,
    archived: false,
    model: "dashboard",
  };
}

const CURRENT_USER = {
  id: 1,
  personal_collection_id: 100,
  is_superuser: true,
};

const COLLECTION = {
  ROOT: collection({ id: "root", name: "Our analytics", location: null }),
  PERSONAL: collection({
    id: CURRENT_USER.personal_collection_id,
    name: "My personal collection",
    personal_owner_id: CURRENT_USER.id,
  }),
  REGULAR: collection({ id: 1, name: "Regular collection" }),
  READ_ONLY: collection({
    id: 2,
    name: "Read only collection",
    can_write: false,
  }),
};

COLLECTION.REGULAR_CHILD = collection({
  id: 3,
  name: "Read-only collection's child (writable)",
  location: `/${COLLECTION.REGULAR.id}/`,
});

const DASHBOARD = {
  REGULAR: dashboard({ id: 1, name: "Regular dashboard" }),
};

function mockCollectionEndpoint() {
  xhrMock.get("/api/collection", {
    body: JSON.stringify(Object.values(COLLECTION)),
  });
}

function mockCollectionItemsEndpoint() {
  xhrMock.get("/api/collection/root/items?models=dashboard", (req, res) => {
    const dashboards = Object.values(DASHBOARD).filter(
      dashboard => dashboard.collection_id === null,
    );
    return res.status(200).body(
      JSON.stringify({
        total: dashboards.length,
        data: dashboards,
      }),
    );
  });

  xhrMock.get("/api/collection/root/items", (req, res) => {
    const dashboards = Object.values(DASHBOARD).filter(
      dashboard => dashboard.collection_id === null,
    );
    const collections = Object.values(COLLECTION).filter(
      collection => collection.location !== "/",
    );
    const data = [...dashboards, ...collections];
    return res.status(200).body(
      JSON.stringify({
        total: data.length,
        data,
      }),
    );
  });
}

async function setup({ models = ["dashboard"], ...props } = {}) {
  mockCollectionEndpoint();
  mockCollectionItemsEndpoint();

  const onChange = jest.fn();

  const store = getStore({
    currentUser: () => CURRENT_USER,
  });

  render(
    <Provider store={store}>
      <ItemPicker models={models} onChange={onChange} {...props} />
    </Provider>,
  );

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
}

describe("ItemPicker", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("displays items from the root collection by default", async () => {
    await setup();
    expect(screen.queryByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
  });

  it("does not display read-only collections", async () => {
    await setup();
    expect(screen.queryByText(COLLECTION.READ_ONLY.name)).toBeNull();
  });
});
