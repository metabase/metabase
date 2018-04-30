jest.mock("metabase/query_builder/components/NativeQueryEditor");

import { mount } from "enzyme";

import {
  createSavedQuestion,
  createDashboard,
  createTestStore,
  useSharedAdminLogin,
  logout,
  waitForRequestToComplete,
  waitForAllRequestsToComplete,
  cleanup,
} from "__support__/integrated_tests";

import jwt from "jsonwebtoken";

import { FETCH_DASHBOARD } from "metabase/dashboard/dashboard";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import ParameterWidget from "metabase/parameters/components/ParameterWidget";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import ParameterFieldWidget from "metabase/parameters/components/widgets/ParameterFieldWidget";
import TokenField from "metabase/components/TokenField";

import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/lib/Question";

import {
  CardApi,
  DashboardApi,
  SettingsApi,
  MetabaseApi,
} from "metabase/services";

const ORDER_USER_ID_FIELD_ID = 7;
const PEOPLE_ID_FIELD_ID = 13;
const PEOPLE_NAME_FIELD_ID = 16;
const PEOPLE_SOURCE_FIELD_ID = 18;

const METABASE_SECRET_KEY =
  "24134bd93e081773fb178e8e1abb4e8a973822f7e19c872bd92c8d5a122ef63f";

describe("parameters", () => {
  let question, dashboard;

  beforeAll(async () => {
    useSharedAdminLogin();

    // enable public sharing
    await SettingsApi.put({ key: "enable-public-sharing", value: true });
    cleanup.fn(() =>
      SettingsApi.put({ key: "enable-public-sharing", value: false }),
    );

    await SettingsApi.put({ key: "enable-embedding", value: true });
    cleanup.fn(() =>
      SettingsApi.put({ key: "enable-embedding", value: false }),
    );

    await SettingsApi.put({
      key: "embedding-secret-key",
      value: METABASE_SECRET_KEY,
    });

    await MetabaseApi.field_dimension_update({
      fieldId: ORDER_USER_ID_FIELD_ID,
      type: "external",
      name: "User ID",
      human_readable_field_id: PEOPLE_NAME_FIELD_ID,
    });
    cleanup.fn(() =>
      MetabaseApi.field_dimension_delete({
        fieldId: ORDER_USER_ID_FIELD_ID,
      }),
    );

    // set each of these fields to have "has_field_values" = "search"
    for (const fieldId of [
      ORDER_USER_ID_FIELD_ID,
      PEOPLE_ID_FIELD_ID,
      PEOPLE_NAME_FIELD_ID,
    ]) {
      const field = await MetabaseApi.field_get({
        fieldId: fieldId,
      });
      await MetabaseApi.field_update({
        id: fieldId,
        has_field_values: "search",
      });
      cleanup.fn(() => MetabaseApi.field_update(field));
    }

    const store = await createTestStore();
    await store.dispatch(fetchTableMetadata(1));
    const metadata = getMetadata(store.getState());

    let unsavedQuestion = Question.create({
      databaseId: 1,
      metadata,
    })
      .setDatasetQuery({
        type: "native",
        database: 1,
        native: {
          query:
            "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */",
          template_tags: {
            id: {
              id: "1",
              name: "id",
              display_name: "ID",
              type: "dimension",
              dimension: ["field-id", PEOPLE_ID_FIELD_ID],
              widget_type: "id",
            },
            name: {
              id: "2",
              name: "name",
              display_name: "Name",
              type: "dimension",
              dimension: ["field-id", PEOPLE_NAME_FIELD_ID],
              widget_type: "category",
            },
            source: {
              id: "3",
              name: "source",
              display_name: "Source",
              type: "dimension",
              dimension: ["field-id", PEOPLE_SOURCE_FIELD_ID],
              widget_type: "category",
            },
            user_id: {
              id: "4",
              name: "user_id",
              display_name: "User",
              type: "dimension",
              dimension: ["field-id", ORDER_USER_ID_FIELD_ID],
              widget_type: "id",
            },
          },
        },
        parameters: [],
      })
      .setDisplay("scalar")
      .setDisplayName("Test Question");
    question = await createSavedQuestion(unsavedQuestion);
    cleanup.fn(() =>
      CardApi.update({
        id: question.id(),
        archived: true,
      }),
    );

    // create a dashboard
    dashboard = await createDashboard({
      name: "Test Dashboard",
      description: null,
      parameters: [
        { name: "ID", slug: "id", id: "1", type: "id" },
        { name: "Name", slug: "name", id: "2", type: "category" },
        { name: "Source", slug: "source", id: "3", type: "category" },
        { name: "User", slug: "user_id", id: "4", type: "id" },
      ],
    });
    cleanup.fn(() =>
      DashboardApi.update({
        id: dashboard.id,
        archived: true,
      }),
    );

    const dashcard = await DashboardApi.addcard({
      dashId: dashboard.id,
      cardId: question.id(),
    });
    await DashboardApi.reposition_cards({
      dashId: dashboard.id,
      cards: [
        {
          id: dashcard.id,
          card_id: question.id(),
          row: 0,
          col: 0,
          sizeX: 4,
          sizeY: 4,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: "1",
              card_id: question.id(),
              target: ["dimension", ["template-tag", "id"]],
            },
            {
              parameter_id: "2",
              card_id: question.id(),
              target: ["dimension", ["template-tag", "name"]],
            },
            {
              parameter_id: "3",
              card_id: question.id(),
              target: ["dimension", ["template-tag", "source"]],
            },
            {
              parameter_id: "4",
              card_id: question.id(),
              target: ["dimension", ["template-tag", "user_id"]],
            },
          ],
        },
      ],
    });
  });

  describe("private questions", () => {
    let app, store;
    it("should be possible to view a private question", async () => {
      useSharedAdminLogin();

      store = await createTestStore();
      store.pushPath(Urls.question(question.id()) + "?id=1");
      app = mount(store.getAppContainer());

      await waitForRequestToComplete("GET", /^\/api\/card\/\d+/);
      expect(app.find(".Header-title-name").text()).toEqual("Test Question");

      // wait for the query to load
      await waitForRequestToComplete("POST", /^\/api\/card\/\d+\/query/);
    });
    sharedParametersTests(() => ({ app, store }));
  });

  describe("public questions", () => {
    let app, store;
    it("should be possible to view a public question", async () => {
      useSharedAdminLogin();
      const publicQuestion = await CardApi.createPublicLink({
        id: question.id(),
      });

      logout();

      store = await createTestStore({ publicApp: true });
      store.pushPath(Urls.publicQuestion(publicQuestion.uuid) + "?id=1");
      app = mount(store.getAppContainer());

      await waitForRequestToComplete("GET", /^\/api\/[^\/]*\/card/);
      expect(app.find(".EmbedFrame-header .h4").text()).toEqual(
        "Test Question",
      );

      // wait for the query to load
      await waitForRequestToComplete(
        "GET",
        /^\/api\/public\/card\/[^\/]+\/query/,
      );
    });
    sharedParametersTests(() => ({ app, store }));
  });

  describe("embed questions", () => {
    let app, store;
    it("should be possible to view a embedded question", async () => {
      useSharedAdminLogin();
      await CardApi.update({
        id: question.id(),
        embedding_params: {
          id: "enabled",
          name: "enabled",
          source: "enabled",
          user_id: "enabled",
        },
        enable_embedding: true,
      });

      logout();

      const token = jwt.sign(
        {
          resource: { question: question.id() },
          params: {},
        },
        METABASE_SECRET_KEY,
      );

      store = await createTestStore({ embedApp: true });
      store.pushPath(Urls.embedCard(token) + "?id=1");
      app = mount(store.getAppContainer());

      await waitForRequestToComplete("GET", /\/card\/[^\/]+/);

      expect(app.find(".EmbedFrame-header .h4").text()).toEqual(
        "Test Question",
      );

      // wait for the query to load
      await waitForRequestToComplete(
        "GET",
        /^\/api\/embed\/card\/[^\/]+\/query/,
      );
    });
    sharedParametersTests(() => ({ app, store }));
  });

  describe("private dashboards", () => {
    let app, store;
    it("should be possible to view a private dashboard", async () => {
      useSharedAdminLogin();

      store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboard.id) + "?id=1");
      app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".DashboardHeader .Entity h2").text()).toEqual(
        "Test Dashboard",
      );

      // wait for the query to load
      await waitForRequestToComplete("POST", /^\/api\/card\/[^\/]+\/query/);

      // wait for required field metadata to load
      await waitForRequestToComplete("GET", /^\/api\/field\/[^\/]+/);
    });
    sharedParametersTests(() => ({ app, store }));
  });

  describe("public dashboards", () => {
    let app, store;
    it("should be possible to view a public dashboard", async () => {
      useSharedAdminLogin();
      const publicDash = await DashboardApi.createPublicLink({
        id: dashboard.id,
      });

      logout();

      store = await createTestStore({ publicApp: true });
      store.pushPath(Urls.publicDashboard(publicDash.uuid) + "?id=1");
      app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".EmbedFrame-header .h4").text()).toEqual(
        "Test Dashboard",
      );

      // wait for the query to load
      await waitForRequestToComplete(
        "GET",
        /^\/api\/public\/dashboard\/[^\/]+\/card\/[^\/]+/,
      );
    });
    sharedParametersTests(() => ({ app, store }));
  });

  describe("embed dashboards", () => {
    let app, store;
    it("should be possible to view a embed dashboard", async () => {
      useSharedAdminLogin();
      await DashboardApi.update({
        id: dashboard.id,
        embedding_params: {
          id: "enabled",
          name: "enabled",
          source: "enabled",
          user_id: "enabled",
        },
        enable_embedding: true,
      });

      logout();

      const token = jwt.sign(
        {
          resource: { dashboard: dashboard.id },
          params: {},
        },
        METABASE_SECRET_KEY,
      );

      store = await createTestStore({ embedApp: true });
      store.pushPath(Urls.embedDashboard(token) + "?id=1");
      app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);

      expect(app.find(".EmbedFrame-header .h4").text()).toEqual(
        "Test Dashboard",
      );

      // wait for the query to load
      await waitForRequestToComplete(
        "GET",
        /^\/api\/embed\/dashboard\/[^\/]+\/dashcard\/\d+\/card\/\d+/,
      );
    });
    sharedParametersTests(() => ({ app, store }));
  });

  afterAll(cleanup);
});

async function sharedParametersTests(getAppAndStore) {
  let app;
  beforeEach(() => {
    const info = getAppAndStore();
    app = info.app;
  });

  it("should have 4 ParameterFieldWidgets", async () => {
    await waitForAllRequestsToComplete();

    expect(app.find(ParameterWidget).length).toEqual(4);
    expect(app.find(ParameterFieldWidget).length).toEqual(4);
  });

  it("open 4 FieldValuesWidgets", async () => {
    // click each parameter to open the widget
    app.find(ParameterFieldWidget).map(widget => widget.simulate("click"));

    const widgets = app.find(FieldValuesWidget);
    expect(widgets.length).toEqual(4);
  });

  // it("should have the correct field and searchField", () => {
  //   const widgets = app.find(FieldValuesWidget);
  //   expect(
  //     widgets.map(widget => {
  //       const { field, searchField } = widget.props();
  //       return [field && field.id, searchField && searchField.id];
  //     }),
  //   ).toEqual([
  //     [PEOPLE_ID_FIELD_ID, PEOPLE_NAME_FIELD_ID],
  //     [PEOPLE_NAME_FIELD_ID, PEOPLE_NAME_FIELD_ID],
  //     [PEOPLE_SOURCE_FIELD_ID, PEOPLE_SOURCE_FIELD_ID],
  //     [ORDER_USER_ID_FIELD_ID, PEOPLE_NAME_FIELD_ID],
  //   ]);
  // });

  it("should have the correct values", () => {
    const widgets = app.find(FieldValuesWidget);
    const values = widgets.map(
      widget =>
        widget
          .find("ul") // first ul is options
          .at(0)
          .find("li")
          .map(li => li.text())
          .slice(0, -1), // the last item is the input, remove it
    );
    expect(values).toEqual([
      ["Hudson Borer - 1"], // remapped value
      [],
      [],
      [],
    ]);
  });

  it("should have the correct placeholders", () => {
    const widgets = app.find(FieldValuesWidget);
    const placeholders = widgets.map(
      widget => widget.find(TokenField).props().placeholder,
    );
    expect(placeholders).toEqual([
      "Search by Name or enter an ID",
      "Search by Name",
      "Search the list",
      "Search by Name or enter an ID",
    ]);
  });

  it("should allow searching PEOPLE.ID by PEOPLE.NAME", async () => {
    const widget = app.find(FieldValuesWidget).at(0);
    // tests `search` endpoint
    expect(widget.find("li").length).toEqual(1 + 1);
    widget.find("input").simulate("change", { target: { value: "Aly" } });
    await waitForRequestToComplete("GET", /\/field\/.*\/search/);
    expect(widget.find("li").length).toEqual(1 + 1 + 4);
  });
  it("should allow searching PEOPLE.NAME by PEOPLE.NAME", async () => {
    const widget = app.find(FieldValuesWidget).at(1);
    // tests `search` endpoint
    expect(widget.find("li").length).toEqual(1);
    widget.find("input").simulate("change", { target: { value: "Aly" } });
    await waitForRequestToComplete("GET", /\/field\/.*\/search/);
    expect(widget.find("li").length).toEqual(1 + 4);
  });
  it("should show values for PEOPLE.SOURCE", async () => {
    const widget = app.find(FieldValuesWidget).at(2);
    // tests `values` endpoint
    // NOTE: no need for waitForRequestToComplete because it was previously loaded?
    // await waitForRequestToComplete("GET", /\/field\/.*\/values/);
    expect(widget.find("li").length).toEqual(1 + 5); // 5 options + 1 for the input
  });
  it("should allow searching ORDER.USER_ID by PEOPLE.NAME", async () => {
    const widget = app.find(FieldValuesWidget).at(3);
    // tests `search` endpoint
    expect(widget.find("li").length).toEqual(1);
    widget.find("input").simulate("change", { target: { value: "Aly" } });
    await waitForRequestToComplete("GET", /\/field\/.*\/search/);
    expect(widget.find("li").length).toEqual(1 + 4);
  });
}
