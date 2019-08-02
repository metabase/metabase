jest.mock("metabase/components/Popover");

import { mount } from "__support__/enzyme";
import {
  useSharedAdminLogin,
  createTestStore,
  waitForAllRequestsToComplete,
} from "__support__/e2e";

describe("query builder", () => {
  let store;
  beforeAll(() => useSharedAdminLogin());
  beforeEach(async () => {
    store = await createTestStore();
  });
  describe("browse data", () => {
    it("should load orders table and summarize", async () => {
      store.pushPath("/");
      const app = mount(store.getAppContainer());
      await app.async.findByText("Browse Data").click();
      await app.async.findByText("Sample Dataset").click();
      await app.async.findByText("Orders").click();

      await app.async.findByText("37.65");

      await app.async.findByText("Summarize").click();
      await app.async.findByText("Done").click();
      await app.async.findByText("18,760");
    });
  });
  describe("ask a (simple) question", () => {
    it("should load orders table", async () => {
      store.pushPath("/");

      const app = mount(store.getAppContainer());
      await app.async.findByText("Ask a question").click();
      await waitForAllRequestsToComplete(); // race condition in DataSelector with loading metadata
      await app.async.findByText("Simple question").click();
      // await app.async.findByText("Sample Dataset").click(); // not needed if there's only one database
      await app.async.findByText("Orders").click();
      await app.async.findByText("37.65");
    });
  });

  describe("ask a (custom) question", () => {
    it("should load orders table", async () => {
      store.pushPath("/");
      const app = mount(store.getAppContainer());

      await app.async.findByText("Ask a question").click();
      await waitForAllRequestsToComplete(); // race condition in DataSelector with loading metadata
      await app.async.findByText("Custom question").click();
      // await app.async.findByText("Sample Dataset").click(); // not needed if there's only one database
      await app.async.findByText("Orders").click();
      await app.async.findByText("Visualize").click();
      await app.async.findByText("37.65");
    });
  });
});
