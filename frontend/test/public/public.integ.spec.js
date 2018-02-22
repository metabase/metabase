import { mount } from "enzyme";

import {
  createSavedQuestion,
  createDashboard,
  createTestStore,
  useSharedAdminLogin,
  logout,
  waitForRequestToComplete,
} from "__support__/integrated_tests";

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

const PRODUCT_USER_ID_FIELD_ID = 7;
const PEOPLE_ID_FIELD_ID = 13;
const PEOPLE_NAME_FIELD_ID = 16;
const PEOPLE_SOURCE_FIELD_ID = 18;

describe("public pages", () => {
  let store, metadata;
  beforeAll(async () => {
    // needed to enable public sharing
    useSharedAdminLogin();
    // enable public sharing
    await SettingsApi.put({ key: "enable-public-sharing", value: true });
  });

  describe("public dashboards", () => {
    let dashboard, publicDash;
    beforeAll(async () => {
      useSharedAdminLogin();

      // create a dashboard
      dashboard = await createDashboard({
        name: "Test public dash",
        description: "A dashboard for testing public things",
      });
      // create the public link for that dashboard
      publicDash = await DashboardApi.createPublicLink({ id: dashboard.id });

      // shared store for all dashboard tests
      store = await createTestStore();
    });

    it("should be possible to view a public dashboard", async () => {
      logout();

      store.pushPath(Urls.publicDashboard(publicDash.uuid));

      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);

      const headerText = app.find(".EmbedFrame-header .h4").text();

      expect(headerText).toEqual("Test public dash");
    });

    afterAll(async () => {
      useSharedAdminLogin();
      // archive the dash so we don't impact other tests
      await DashboardApi.update({
        id: dashboard.id,
        archived: true,
      });
    });
  });

  describe("public questions", () => {
    let question, publicQuestion;

    beforeAll(async () => {
      useSharedAdminLogin();

      await MetabaseApi.field_dimension_update({
        fieldId: PRODUCT_USER_ID_FIELD_ID,
        type: "external",
        name: "User ID",
        human_readable_field_id: PEOPLE_NAME_FIELD_ID,
      });

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
                dimension: ["field-id", PRODUCT_USER_ID_FIELD_ID],
                widget_type: "id",
              },
            },
          },
          parameters: [],
        })
        .setDisplay("scalar")
        .setDisplayName("Just raw, untamed data");
      question = await createSavedQuestion(unsavedQuestion);

      // create the public link for that dashboard
      publicQuestion = await CardApi.createPublicLink({ id: question.id() });

      // shared store for all dashboard tests
      store = await createTestStore();
    });

    it("should be possible to view a public question", async () => {
      logout();

      store.pushPath(Urls.publicQuestion(publicQuestion.uuid) + "?id=1");

      const app = mount(store.getAppContainer());

      // wait for the query to load
      await waitForRequestToComplete("GET", /^\/api\/public\/card\/.*\/query/);

      const headerText = app.find(".EmbedFrame-header .h4").text();
      expect(headerText).toEqual("Just raw, untamed data");

      expect(app.find(".ScalarValue").text()).toEqual("1");

      expect(app.find(ParameterFieldWidget).length).toEqual(4);

      // click each parameter to open the widget
      app.find(ParameterFieldWidget).map(widget => widget.simulate("click"));

      const widgets = app.find(FieldValuesWidget);
      expect(widgets.length).toEqual(4);

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
        ["Adelia Eichmann - 1"], // remapped value
        [],
        [],
        [],
      ]);

      const inputs = widgets.find("input");
      const placeholders = widgets.map(
        widget => widget.find(TokenField).props().placeholder,
      );
      expect(placeholders).toEqual([
        "Search by Name or enter an ID",
        "Search by Name",
        "Search the list",
        "Search by Name or enter an ID",
      ]);

      // tests `search` endpoint
      expect(widgets.at(0).find("li").length).toEqual(1 + 1);
      inputs.at(0).simulate("change", { target: { value: "Aly" } });
      await waitForRequestToComplete("GET", /\/field\/.*\/search/);
      expect(widgets.at(0).find("li").length).toEqual(1 + 1 + 6);

      // tests `search` endpoint
      expect(widgets.at(1).find("li").length).toEqual(1);
      inputs.at(1).simulate("change", { target: { value: "Aly" } });
      await waitForRequestToComplete("GET", /\/field\/.*\/search/);
      expect(widgets.at(1).find("li").length).toEqual(1 + 6);

      // tests `values` endpoint
      // NOTE: no need for waitForRequestToComplete because it was previously loaded?
      // await waitForRequestToComplete("GET", /\/field\/.*\/values/);
      expect(widgets.at(2).find("li").length).toEqual(1 + 5); // 5 options + 1 for the input

      // tests `search` endpoint
      expect(widgets.at(3).find("li").length).toEqual(1);
      inputs.at(3).simulate("change", { target: { value: "Aly" } });
      await waitForRequestToComplete("GET", /\/field\/.*\/search/);
      expect(widgets.at(3).find("li").length).toEqual(1 + 6);
    });

    afterAll(async () => {
      useSharedAdminLogin();
      // archive the card so we don't impact other tests
      await CardApi.update({
        id: question.id(),
        archived: true,
      });
    });
  });

  afterAll(async () => {
    // do some cleanup so that we don't impact other tests
    await SettingsApi.put({ key: "enable-public-sharing", value: false });
  });
});
