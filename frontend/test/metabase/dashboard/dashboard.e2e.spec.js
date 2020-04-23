import {
  BROWSER_HISTORY_PUSH,
  createTestStore,
  useSharedAdminLogin,
  cleanup,
} from "__support__/e2e";
import { click, clickButton, setInputValue } from "__support__/enzyme";

import { DashboardApi, PublicApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";
import { makeGetMergedParameterFieldValues } from "metabase/selectors/metadata";
import { ADD_PARAM_VALUES } from "metabase/redux/metadata";
import { mount } from "enzyme";
import {
  fetchDashboard,
  ADD_PARAMETER,
  FETCH_DASHBOARD,
  SAVE_DASHBOARD_AND_CARDS,
  SET_EDITING_DASHBOARD,
  SET_EDITING_PARAMETER_ID,
  FETCH_CARD_DATA,
} from "metabase/dashboard/dashboard";

import Question from "metabase/entities/questions";
import Search from "metabase/entities/search";
import Revisions from "metabase/entities/revisions";

import { updateSetting } from "metabase/admin/settings/settings";

import EditBar from "metabase/components/EditBar";

import { delay } from "metabase/lib/promise";
import DashboardHeader from "metabase/dashboard/components/DashboardHeader";
import {
  ParameterOptionItem,
  ParameterOptionsSection,
} from "metabase/dashboard/components/ParametersPopover";
import ParameterWidget from "metabase/parameters/components/ParameterWidget";
import ParameterValueWidget from "metabase/parameters/components/ParameterValueWidget";
import { PredefinedRelativeDatePicker } from "metabase/parameters/components/widgets/DateRelativeWidget";
import HeaderModal from "metabase/components/HeaderModal";
import DashboardHistoryModal from "metabase/dashboard/components/DashboardHistoryModal";

// TODO Atte Keinänen 7/17/17: When we have a nice way to create dashboards in tests, this could use a real saved dashboard
// instead of mocking the API endpoint

// Mock the dashboard endpoint using a real response of `public/dashboard/:dashId`
const mockPublicDashboardResponse = {
  name: "Dashboard",
  description: "For testing parameter values",
  id: 40,
  parameters: [
    { name: "Category", slug: "category", id: "598ab323", type: "category" },
  ],
  ordered_cards: [
    {
      sizeX: 6,
      series: [],
      card: {
        id: 25,
        name: "Orders over time",
        description: null,
        display: "line",
        dataset_query: { type: "query" },
      },
      col: 0,
      id: 105,
      parameter_mappings: [
        {
          parameter_id: "598ab323",
          card_id: 25,
          target: ["dimension", ["fk->", ["field-id", 3], ["field-id", 21]]],
        },
      ],
      card_id: 25,
      visualization_settings: {},
      dashboard_id: 40,
      sizeY: 6,
      row: 0,
    },
  ],
  // Parameter values are self-contained in the public dashboard response
  param_values: {
    "21": {
      values: ["Doohickey", "Gadget", "Gizmo", "Widget"],
      human_readable_values: {},
      field_id: 21,
    },
  },
};
PublicApi.dashboard = async () => {
  return mockPublicDashboardResponse;
};

describe("Dashboard", () => {
  let question;

  beforeAll(async () => {
    useSharedAdminLogin();

    question = await Question.api.create({
      name: "Example Question",
      display: "scalar",
      visualization_settings: {},
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": 1,
          aggregation: [["count"]],
        },
      },
    });

    cleanup.question(question);
  });

  afterAll(cleanup);

  describe("redux actions", () => {
    describe("fetchDashboard(...)", () => {
      it("should add the parameter values to state tree for public dashboards", async () => {
        const store = await createTestStore();
        // using hash as dashboard id should invoke the public API
        await store.dispatch(
          fetchDashboard("6e59cc97-3b6a-4bb6-9e7a-5efeee27e40f"),
        );
        await store.waitForActions(ADD_PARAM_VALUES);

        const getMergedParameterFieldValues = makeGetMergedParameterFieldValues();
        const fieldValues = await getMergedParameterFieldValues(
          store.getState(),
          { parameter: { field_ids: [21] } },
        );
        expect(fieldValues).toEqual([
          ["Doohickey"],
          ["Gadget"],
          ["Gizmo"],
          ["Widget"],
        ]);
      });
    });
  });

  // Converted from Selenium E2E test
  describe("dashboard page", () => {
    let dashboardId = null;

    const checkDashboardWasCreated = () => {
      if (!dashboardId) {
        throw new Error(
          "Test fails because previous tests failed to create a dashboard",
        );
      }
    };

    it("lets you change title and description", async () => {
      const name = "Customer Feedback Analysis";
      const description =
        "For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response";

      // Create a dashboard programmatically
      const dashboard = await DashboardApi.create({ name, description });
      cleanup.dashboard(dashboard);
      dashboardId = dashboard.id;

      const store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboardId));
      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);

      // Test dashboard renaming
      click(app.find(".Icon.Icon-pencil"));
      await store.waitForActions([SET_EDITING_DASHBOARD]);

      const headerInputs = app.find(".Header-title input");
      setInputValue(headerInputs.first(), "Customer Analysis Paralysis");
      setInputValue(headerInputs.at(1), "");

      clickButton(app.find(EditBar).find(".Button--primary.Button"));
      await store.waitForActions([SAVE_DASHBOARD_AND_CARDS, FETCH_DASHBOARD]);

      await delay(500);

      expect(app.find(DashboardHeader).text()).toMatch(
        /Customer Analysis Paralysis/,
      );
    });

    it("lets you add a filter", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboardId));
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_DASHBOARD]);

      // Test parameter filter creation
      click(app.find(".Icon.Icon-pencil"));
      await store.waitForActions([SET_EDITING_DASHBOARD]);
      click(app.find(".Icon.Icon-funnel_add"));
      // Choose Time filter type
      click(
        app
          .find(ParameterOptionsSection)
          .filterWhere(section => section.text().match(/Time/)),
      );

      // Choose Relative date filter
      click(
        app
          .find(ParameterOptionItem)
          .filterWhere(item => item.text().match(/Relative Date/)),
      );

      await store.waitForActions(ADD_PARAMETER);

      click(app.find(ParameterValueWidget));
      clickButton(
        app
          .find(PredefinedRelativeDatePicker)
          .find("button[children='Yesterday']"),
      );
      expect(app.find(ParameterValueWidget).text()).toEqual("Yesterday");

      clickButton(app.find(HeaderModal).find("button[children='Done']"));

      // Wait until the header modal exit animation is finished
      await store.waitForActions([SET_EDITING_PARAMETER_ID]);

      // save
      clickButton(app.find(".Button.Button--small.Button--primary"));
      await store.waitForActions([FETCH_DASHBOARD]);
    });

    it("shows previously added parameter", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      const dashboardUrl = Urls.dashboard(dashboardId);
      store.pushPath(dashboardUrl);
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(ParameterWidget)).toHaveLength(1);
    });

    it("hides parameters named in 'hide_parameters' option", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      const dashboardUrl = Urls.dashboard(dashboardId);
      store.pushPath(dashboardUrl + "#hide_parameters=relative_date");
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(ParameterWidget)).toHaveLength(0);
    });

    it("lets you open and close the revisions screen", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      const dashboardUrl = Urls.dashboard(dashboardId);
      store.pushPath(dashboardUrl);
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_DASHBOARD]);

      click(app.find(".Icon.Icon-pencil"));
      await store.waitForActions([SET_EDITING_DASHBOARD]);

      click(app.find(".Icon.Icon-history"));

      await store.waitForActions([Revisions.actionTypes.FETCH_LIST]);
      await delay(10);

      const modal = app.find(DashboardHistoryModal);
      expect(modal.length).toBe(1);
      expect(store.getPath()).toBe(`${dashboardUrl}/history`);

      click(modal.find(".Icon.Icon-close"));
      await store.waitForActions([BROWSER_HISTORY_PUSH]);
      expect(store.getPath()).toBe(`/dashboard/${dashboardId}`);
    });

    it("lets you go directly to the revisions screen via url", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      const dashboardUrl = Urls.dashboard(dashboardId);
      store.pushPath(dashboardUrl + `/history`);
      const app = mount(store.getAppContainer());
      await store.waitForActions([Revisions.actionTypes.FETCH_LIST]);
      await delay(10);

      const modal = app.find(DashboardHistoryModal);
      expect(modal.length).toBe(1);
      expect(store.getPath()).toBe(`${dashboardUrl}/history`);

      // check that we can normally return to the revisions screen
      click(modal.find(".Icon.Icon-close"));
      await store.waitForActions([BROWSER_HISTORY_PUSH]);
      expect(store.getPath()).toBe(`/dashboard/${dashboardId}`);
    });

    it("lets you add a question", async () => {
      const store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboardId));
      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".DashCard")).toHaveLength(0);

      click(app.find(".Dashboard .Icon.Icon-add"));

      await store.waitForActions([Search.actionTypes.FETCH_LIST]);

      expect(question.name).toBe("Example Question");
      await delay(100);

      click(app.find(`h4[children=\"${question.name}\"]`));

      await store.waitForActions([FETCH_CARD_DATA]);
      expect(app.find(".DashCard")).toHaveLength(1);

      clickButton(app.find(EditBar).find(".Button--primary.Button"));
      await store.waitForActions([SAVE_DASHBOARD_AND_CARDS, FETCH_DASHBOARD]);
    });

    it("should have added card", async () => {
      const store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboardId));
      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".DashCard")).toHaveLength(1);
    });

    it("lets you duplicate a dashboard", async () => {
      const store = await createTestStore();
      store.pushPath(Urls.dashboard(dashboardId));
      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".DashCard")).toHaveLength(1);

      // click copy button
      click(app.find(".Icon.Icon-clone"));
      // click duplicate button
      clickButton(app.find('.Button [children="Duplicate"]'));
      await delay(250);

      await store.waitForActions([BROWSER_HISTORY_PUSH]);
      // NOTE: assumes incrementing dashboardId
      expect(store.getPath()).toBe(`/dashboard/${dashboardId + 1}`);

      await store.waitForActions([FETCH_DASHBOARD]);
      expect(app.find(".DashCard")).toHaveLength(1);
    });

    it("displays the correct embed snippets", async () => {
      checkDashboardWasCreated();

      const store = await createTestStore();
      await store.dispatch(
        updateSetting({ key: "enable-embedding", value: true }),
      );

      await store.dispatch(
        updateSetting({
          key: "embedding-secret-key",
          value:
            "2547733eb6a2fc0ff405f43ca94433b90b8f49aa2c667c39d3c7ce8750fcf1af",
        }),
      );

      const dashboardUrl = Urls.dashboard(dashboardId);
      store.pushPath(dashboardUrl);
      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_DASHBOARD]);
      app.findByIcon("share").click();
      app.findByText("Embed this dashboard in an application").click();
      app.findByText("Code").click();
      const [js, html] = app.find("TextEditor").map(n => n.prop("value"));
      expect(js)
        .toBe(`// you will need to install via 'npm install jsonwebtoken' or in your package.json

var jwt = require("jsonwebtoken");

var METABASE_SITE_URL = "http://localhost:4000";
var METABASE_SECRET_KEY = "2547733eb6a2fc0ff405f43ca94433b90b8f49aa2c667c39d3c7ce8750fcf1af";

var payload = {
  resource: { dashboard: ${dashboardId} },
  params: {},
  exp: Math.round(Date.now() / 1000) + (10 * 60) // 10 minute expiration
};
var token = jwt.sign(payload, METABASE_SECRET_KEY);

var iframeUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";`);
      expect(html).toBe(`<iframe
    src="{{iframeUrl}}"
    frameborder="0"
    width="800"
    height="600"
    allowtransparency
></iframe>`);

      await store.dispatch(
        updateSetting({ key: "enable-embedding", value: false }),
      );
    });
  });
});
