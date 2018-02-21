import { mount } from "enzyme";

import {
  createDashboard,
  createTestStore,
  useSharedAdminLogin,
  createSavedQuestion,
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
import { delay } from "metabase/lib/promise";

import {
  CardApi,
  DashboardApi,
  SettingsApi,
  MetabaseApi,
} from "metabase/services";

describe("public pages", () => {
  let store, metadata;
  beforeAll(async () => {
    // needed to create the public dash
    useSharedAdminLogin();
    // enable public sharing
    await SettingsApi.put({ key: "enable-public-sharing", value: true });
  });
  beforeEach(async () => {
    store = await createTestStore();
  });

  describe("public dashboards", () => {
    let dashboard, publicDash;
    beforeAll(async () => {
      // create a dashboard
      dashboard = await createDashboard({
        name: "Test public dash",
        description: "A dashboard for testing public things",
      });
      // create the public link for that dashboard
      publicDash = await DashboardApi.createPublicLink({ id: dashboard.id });
    });

    it("should be possible to view a public dashboard", async () => {
      store.pushPath(Urls.publicDashboard(publicDash.uuid));

      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);

      const headerText = app.find(".EmbedFrame-header .h4").text();

      expect(headerText).toEqual("Test public dash");
    });

    afterAll(async () => {
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
                dimension: ["field-id", 13],
                widget_type: "id",
              },
              name: {
                id: "2",
                name: "name",
                display_name: "Name",
                type: "dimension",
                dimension: ["field-id", 16],
                widget_type: "category",
              },
              source: {
                id: "3",
                name: "source",
                display_name: "Source",
                type: "dimension",
                dimension: ["field-id", 18],
                widget_type: "category",
              },
              user_id: {
                id: "4",
                name: "user_id",
                display_name: "User",
                type: "dimension",
                dimension: ["field-id", 7],
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
    });

    it("should be possible to view a public question", async () => {
      store.pushPath(Urls.publicQuestion(publicQuestion.uuid) + "?id=1");

      const app = mount(store.getAppContainer());

      // await store.waitForActions([FETCH_DASHBOARD]);
      await delay(1000);

      const headerText = app.find(".EmbedFrame-header .h4").text();

      expect(headerText).toEqual("Just raw, untamed data");

      expect(app.find(".ScalarValue").text()).toEqual("1");

      expect(app.find(ParameterFieldWidget).length).toEqual(4);

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
            .slice(0, -1), // the last item is the input
      );
      expect(values).toEqual([
        ["1"], // FIXME: should be "Adelia Eichmann - 1" but we haven't implemented the /api/pubic/card/:uuid/field/:field-id/remapped/:remapped-id endpoint
        [],
        [],
        [],
      ]);

      const inputs = widgets.find("input");

      expect(
        widgets.map(widget => widget.find(TokenField).props().placeholder),
      ).toEqual([
        "Search by Name or enter an ID",
        "Search by Name",
        "Search the list",
        "Enter an ID", // FIXME: should be "Search by Name or enter an ID" but we aren't loading field for field.dimensions.human_readable_field_id
      ]);

      // tests `search` endpoint
      expect(widgets.at(0).find("li").length).toEqual(1 + 1);
      expect(widgets.at(1).find("li").length).toEqual(1);

      // tests `values` endpoint
      expect(widgets.at(2).find("li").length).toEqual(1 + 5); // 5 options + 1 for the input

      inputs.at(0).simulate("change", { target: { value: "Aly" } });
      inputs.at(1).simulate("change", { target: { value: "Aly" } });
      await delay(1000);

      expect(widgets.at(0).find("li").length).toEqual(1 + 1 + 6);
      expect(widgets.at(1).find("li").length).toEqual(1 + 6);
    });

    afterAll(async () => {
      // archive the dash so we don't impact other tests
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
