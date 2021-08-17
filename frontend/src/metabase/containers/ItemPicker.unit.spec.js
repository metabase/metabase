import React from "react";
import { Provider } from "react-redux";
import {
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  name: "Regular collection's child",
  location: `/${COLLECTION.REGULAR.id}/`,
});

const COLLECTION_READ_ONLY_CHILD_WRITABLE = collection({
  id: 4,
  name: "Read-only collection's child (writable)",
  location: `/${COLLECTION.READ_ONLY.id}/`,
});

const COLLECTION_OTHER_USERS = collection({
  id: 5,
  name: "John Lennon's personal collection",
  personal_owner_id: CURRENT_USER.id + 1,
});

const DASHBOARD = {
  REGULAR: dashboard({ id: 1, name: "Regular dashboard" }),
  REGULAR_CHILD: dashboard({
    id: 2,
    name: "Regular dashboard (nested)",
    collection_id: COLLECTION.REGULAR.id,
  }),
};

function mockCollectionEndpoint({ extraCollections = [] } = {}) {
  const collections = [...Object.values(COLLECTION), ...extraCollections];
  xhrMock.get("/api/collection", {
    body: JSON.stringify(collections),
  });
}

function mockCollectionItemsEndpoint() {
  xhrMock.get(/\/api\/collection\/(root|[1-9]\d*)\/items.*/, (req, res) => {
    const collectionIdParam = req.url().path.split("/")[3];
    const collectionId =
      collectionIdParam === "root" ? null : parseInt(collectionIdParam, 10);
    const dashboards = Object.values(DASHBOARD).filter(
      dashboard => dashboard.collection_id === collectionId,
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

async function setup({
  models = ["dashboard"],
  extraCollections = [],
  ...props
} = {}) {
  mockCollectionEndpoint({ extraCollections });
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

  return { onChange };
}

function getItemPickerHeader() {
  return within(screen.getByTestId("item-picker-header"));
}

function getItemPickerList() {
  return within(screen.getByTestId("item-picker-list"));
}

function queryListItem(itemName) {
  const node = getItemPickerList()
    .queryByText(itemName)
    .closest("[data-testid=item-picker-item]");
  return within(node);
}

async function openCollection(itemName) {
  const collectionNode = queryListItem(itemName);
  userEvent.click(collectionNode.getByLabelText("chevronright icon"));
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

    // Breadcrumbs
    expect(
      getItemPickerHeader().queryByText(/Our analytics/i),
    ).toBeInTheDocument();

    // Content
    expect(screen.queryByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(screen.queryByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(screen.queryAllByTestId("item-picker-item")).toHaveLength(3);
  });

  it("does not display read-only collections", async () => {
    await setup();
    expect(screen.queryByText(COLLECTION.READ_ONLY.name)).toBeNull();
  });

  it("displays read-only collections if they have writable children", async () => {
    await setup({ extraCollections: [COLLECTION_READ_ONLY_CHILD_WRITABLE] });
    expect(screen.queryByText(COLLECTION.READ_ONLY.name)).toBeInTheDocument();
  });

  it("can open nested collection", async () => {
    await setup();

    await openCollection(COLLECTION.REGULAR.name);

    const header = getItemPickerHeader();
    const list = getItemPickerList();

    // Breadcrumbs
    expect(header.queryByText(/Our analytics/i)).toBeInTheDocument();
    expect(header.queryByText(COLLECTION.REGULAR.name)).toBeInTheDocument();

    // Content
    expect(list.queryByText(COLLECTION.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.queryByText(DASHBOARD.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.queryAllByTestId("item-picker-item")).toHaveLength(2);
  });

  it("can navigate back from a currently open nested collection", async () => {
    await setup();
    await openCollection(COLLECTION.REGULAR.name);
    let header = getItemPickerHeader();

    userEvent.click(header.getByText(/Our analytics/i));

    header = getItemPickerHeader();
    const list = getItemPickerList();

    expect(header.queryByText(COLLECTION.REGULAR.name)).toBeNull();

    expect(list.queryByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(list.queryByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(list.queryByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.queryAllByTestId("item-picker-item")).toHaveLength(3);
  });

  it("calls onChange when selecting an item", async () => {
    const { onChange } = await setup();

    userEvent.click(screen.getByText(DASHBOARD.REGULAR.name));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining(DASHBOARD.REGULAR),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onChange if it's not a collection picker", async () => {
    const { onChange } = await setup();
    userEvent.click(screen.getByText(COLLECTION.REGULAR.name));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("groups personal collections into single folder if there are more than one", async () => {
    await setup({ extraCollections: [COLLECTION_OTHER_USERS] });

    userEvent.click(screen.queryByText(/All personal collections/i));

    const list = getItemPickerList();
    expect(list.queryByText(COLLECTION_OTHER_USERS.name)).toBeInTheDocument();
    expect(list.queryByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.queryAllByTestId("item-picker-item")).toHaveLength(2);
  });
});
