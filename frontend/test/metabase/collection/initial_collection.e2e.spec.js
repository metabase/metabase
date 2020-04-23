import {
  createTestStore,
  createAllUsersWritableCollection,
  useSharedAdminLogin,
  useSharedNormalLogin,
  eventually,
  cleanup,
} from "__support__/e2e";

import { mount } from "enzyme";

const ROOT_COLLECTION_NAME = "Our analytics";
const NORMAL_USER_COLLECTION_NAME = "Robert Charts's Personal Collection";

describe("initial collection id", () => {
  let collection;
  let app, store;

  beforeAll(async () => {
    useSharedAdminLogin();
    collection = await createAllUsersWritableCollection();
    cleanup.collection(collection);
  });
  afterAll(cleanup);

  describe("for admins", () => {
    beforeEach(async () => {
      useSharedAdminLogin();
      store = await createTestStore();
      app = mount(store.getAppContainer());
    });

    describe("a new collection", () => {
      it("should be the parent collection", async () => {
        store.pushPath(`/collection/${collection.id}/new_collection`);
        await assertInitialCollection(app, collection.name);
      });
    });
    describe("a new pulse", () => {
      it("should be the root collection", async () => {
        store.pushPath("/pulse/create");
        await assertInitialCollection(app, ROOT_COLLECTION_NAME);
      });
    });
    describe("a new dashboard", () => {
      it("should be the root collection", async () => {
        store.pushPath("/");
        await clickNewDashboard(app);
        await assertInitialCollection(app, ROOT_COLLECTION_NAME);
      });
    });
  });

  describe("for non-admins", () => {
    beforeEach(async () => {
      useSharedNormalLogin();
      store = await createTestStore();
      app = mount(store.getAppContainer());
    });

    describe("a new pulse", () => {
      it("should be the personal collection", async () => {
        store.pushPath("/pulse/create");
        await assertInitialCollection(app, NORMAL_USER_COLLECTION_NAME);
      });
    });
    describe("a new dashboard", () => {
      it("should be the personal collection", async () => {
        store.pushPath("/");
        await clickNewDashboard(app);
        await assertInitialCollection(app, NORMAL_USER_COLLECTION_NAME);
      });
    });
  });
});

const clickNewDashboard = app =>
  eventually(() => {
    app
      .find("Navbar")
      .find("EntityMenu")
      .first()
      .props()
      .items[0].action();
  });

const assertInitialCollection = (app, collectionName) =>
  eventually(() => {
    expect(
      app
        .find(".AdminSelect")
        .first()
        .text(),
    ).toBe(collectionName);
  });
