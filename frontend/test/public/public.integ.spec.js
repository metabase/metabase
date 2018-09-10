jest.mock("metabase/components/ExplicitSize");

// Converted from an old Selenium E2E test
import {
  useSharedAdminLogin,
  logout,
  createTestStore,
  createDashboard,
  restorePreviousLogin,
  waitForRequestToComplete,
  eventually,
} from "__support__/integrated_tests";

import _ from "underscore";
import jwt from "jsonwebtoken";

import { click, clickButton, setInputValue } from "__support__/enzyme_utils";

import { mount } from "enzyme";

import { LOAD_CURRENT_USER } from "metabase/redux/user";
import {
  INITIALIZE_SETTINGS,
  UPDATE_SETTING,
  updateSetting,
} from "metabase/admin/settings/settings";
import SettingToggle from "metabase/admin/settings/components/widgets/SettingToggle";
import Toggle from "metabase/components/Toggle";
import EmbeddingLegalese from "metabase/admin/settings/components/widgets/EmbeddingLegalese";
import {
  CREATE_PUBLIC_LINK,
  INITIALIZE_QB,
  API_CREATE_QUESTION,
  QUERY_COMPLETED,
  RUN_QUERY,
  SET_QUERY_MODE,
  setDatasetQuery,
  UPDATE_EMBEDDING_PARAMS,
  UPDATE_ENABLE_EMBEDDING,
  UPDATE_TEMPLATE_TAG,
} from "metabase/query_builder/actions";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { delay } from "metabase/lib/promise";
import TagEditorSidebar from "metabase/query_builder/components/template_tags/TagEditorSidebar";
import { getQuery } from "metabase/query_builder/selectors";
import {
  ADD_PARAM_VALUES,
  FETCH_TABLE_METADATA,
} from "metabase/redux/metadata";
import {
  FETCH_DASHBOARD_CARD_DATA,
  FETCH_CARD_DATA,
} from "metabase/dashboard/dashboard";

import Select from "metabase/components/Select";
import RunButton from "metabase/query_builder/components/RunButton";
import Scalar from "metabase/visualizations/visualizations/Scalar";
import ParameterFieldWidget from "metabase/parameters/components/widgets/ParameterFieldWidget";
import TextWidget from "metabase/parameters/components/widgets/TextWidget.jsx";
import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import SharingPane from "metabase/public/components/widgets/SharingPane";
import { EmbedTitle } from "metabase/public/components/widgets/EmbedModalContent";
import PreviewPane from "metabase/public/components/widgets/PreviewPane";
import CopyWidget from "metabase/components/CopyWidget";
import ListSearchField from "metabase/components/ListSearchField";
import * as Urls from "metabase/lib/urls";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";
import EmbedWidget from "metabase/public/components/widgets/EmbedWidget";

import { CardApi, DashboardApi, SettingsApi } from "metabase/services";

const PEOPLE_TABLE_ID = 2;
const PEOPLE_ID_FIELD_ID = 13;

async function updateQueryText(store, queryText) {
  // We don't have Ace editor so we have to trigger the Redux action manually
  const newDatasetQuery = getQuery(store.getState())
    .updateQueryText(queryText)
    .datasetQuery();

  return store.dispatch(setDatasetQuery(newDatasetQuery));
}

const getRelativeUrlWithoutHash = url =>
  url.replace(/#.*$/, "").replace(/http:\/\/.*?\//, "/");

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";
const COUNT_GADGET = "53";

describe("public/embedded", () => {
  beforeAll(async () => useSharedAdminLogin());

  describe("questions", () => {
    let publicUrl = null;
    let embedUrl = null;

    it("should allow users to enable public sharing", async () => {
      const store = await createTestStore();

      // load public sharing settings
      store.pushPath("/admin/settings/public_sharing");
      const app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS]);

      // // if enabled, disable it so we're in a known state
      // // TODO Atte Keinänen 8/9/17: This should be done with a direct API call in afterAll instead
      const enabledToggleContainer = app.find(SettingToggle).first();

      expect(enabledToggleContainer.text()).toBe("Disabled");

      // toggle it on
      click(enabledToggleContainer.find(Toggle));
      await store.waitForActions([UPDATE_SETTING]);

      // make sure it's enabled
      expect(enabledToggleContainer.text()).toBe("Enabled");
    });

    it("should allow users to enable embedding", async () => {
      const store = await createTestStore();

      // load public sharing settings
      store.pushPath("/admin/settings/embedding_in_other_applications");
      const app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS]);

      click(app.find(EmbeddingLegalese).find('button[children="Enable"]'));
      await store.waitForActions([UPDATE_SETTING]);

      expect(app.find(EmbeddingLegalese).length).toBe(0);
      const enabledToggleContainer = app.find(SettingToggle).first();
      expect(enabledToggleContainer.text()).toBe("Enabled");
    });

    // Note: Test suite is sequential, so individual test cases can't be run individually
    it("should allow users to create parameterized SQL questions", async () => {
      // Don't render Ace editor in tests because it uses many DOM methods that aren't supported by jsdom
      // NOTE Atte Keinänen 8/9/17: Ace provides a MockRenderer class which could be used for pseudo-rendering and
      // testing Ace editor in tests, but it doesn't render stuff to DOM so I'm not sure how practical it would be
      NativeQueryEditor.prototype.loadAceEditor = () => {};

      const store = await createTestStore();

      // load public sharing settings
      store.pushPath(Urls.plainQuestion());
      const app = mount(store.getAppContainer());
      await store.waitForActions([INITIALIZE_QB]);

      click(app.find(".Icon-sql"));
      await store.waitForActions([SET_QUERY_MODE]);

      await updateQueryText(
        store,
        "select count(*) from products where {{category}}",
      );

      const tagEditorSidebar = app.find(TagEditorSidebar);

      const fieldFilterVarType = tagEditorSidebar
        .find(".ColumnarSelector-row")
        .at(3);
      expect(fieldFilterVarType.text()).toBe("Field Filter");
      click(fieldFilterVarType);

      // there's an async error here for some reason
      await store.waitForActions([UPDATE_TEMPLATE_TAG]);

      await delay(500);

      const productsRow = tagEditorSidebar
        .find(".TestPopoverBody .List-section")
        .at(4)
        .find("a");
      expect(productsRow.text()).toBe("Products");
      click(productsRow);

      // Table fields should be loaded on-the-fly before showing the field selector
      await store.waitForActions(FETCH_TABLE_METADATA);
      // Needed due to state update after fetching metadata
      await delay(100);

      const searchField = tagEditorSidebar
        .find(".TestPopoverBody")
        .find(ListSearchField)
        .find("input")
        .first();
      setInputValue(searchField, "cat");

      const categoryRow = tagEditorSidebar
        .find(".TestPopoverBody .List-section")
        .at(2)
        .find("a");
      expect(categoryRow.text()).toBe("Category");
      click(categoryRow);

      await store.waitForActions([UPDATE_TEMPLATE_TAG]);

      // close the template variable sidebar
      click(tagEditorSidebar.find(".Icon-close"));

      // test without the parameter
      click(app.find(RunButton));
      await store.waitForActions([RUN_QUERY, QUERY_COMPLETED]);
      expect(app.find(Scalar).text()).toBe(COUNT_ALL);

      // test the parameter
      const parameter = app.find(ParameterFieldWidget).first();
      click(parameter.find("div").first());
      click(parameter.find('span[children="Doohickey"]'));
      clickButton(parameter.find(".Button"));
      click(app.find(RunButton));
      await store.waitForActions([RUN_QUERY, QUERY_COMPLETED]);
      expect(app.find(Scalar).text()).toBe(COUNT_DOOHICKEY);

      // save the question, required for public link/embedding
      click(
        app
          .find(".Header-buttonSection a")
          .first()
          .find("a"),
      );

      setInputValue(
        app.find(SaveQuestionModal).find("input[name='name']"),
        "sql parametrized",
      );

      clickButton(
        app
          .find(SaveQuestionModal)
          .find("button")
          .last(),
      );
      await store.waitForActions([API_CREATE_QUESTION]);
      await delay(100);

      click(app.find('#QuestionSavedModal .Button[children="Not now"]'));
      // wait for modal to close :'(
      await delay(500);

      // open sharing panel
      click(app.find(QuestionEmbedWidget).find(EmbedWidget));

      // "Embed this question in an application"
      click(
        app
          .find(SharingPane)
          .find("h3")
          .last(),
      );

      // currently only one Select is present, but verify it's the right one
      expect(app.find(Select).text()).toBe("Disabled");
      // make the parameter editable
      click(app.find(Select));

      click(app.find(".TestPopoverBody .Icon-pencil"));

      await delay(500);

      click(app.find("div[children='Publish']"));
      await store.waitForActions([
        UPDATE_ENABLE_EMBEDDING,
        UPDATE_EMBEDDING_PARAMS,
      ]);

      // save the embed url for next tests
      embedUrl = getRelativeUrlWithoutHash(
        app
          .find(PreviewPane)
          .find("iframe")
          .prop("src"),
      );

      // back to main share panel
      click(app.find(EmbedTitle));

      // toggle public link on
      click(app.find(SharingPane).find(Toggle));
      await store.waitForActions([CREATE_PUBLIC_LINK]);

      // save the public url for next tests
      publicUrl = getRelativeUrlWithoutHash(
        app
          .find(CopyWidget)
          .find("input")
          .first()
          .prop("value"),
      );
    });

    describe("as an anonymous user", () => {
      beforeAll(() => logout());

      async function runSharedQuestionTests(store, questionUrl, apiRegex) {
        store.pushPath(questionUrl);
        const app = mount(store.getAppContainer());

        await store.waitForActions([ADD_PARAM_VALUES]);

        // Loading the query results is done in PublicQuestion itself so we have to listen to API request instead of Redux action
        await waitForRequestToComplete("GET", apiRegex);
        // use `update()` because of setState
        expect(
          app
            .update()
            .find(Scalar)
            .text(),
        ).toBe(COUNT_ALL + "sql parametrized");

        // NOTE: parameters tests moved to parameters.integ.spec.js

        // set parameter via url
        store.pushPath("/"); // simulate a page reload by visiting other page
        store.pushPath(questionUrl + "?category=Gadget");
        await waitForRequestToComplete("GET", apiRegex);
        // use `update()` because of setState
        await eventually(() =>
          expect(
            app
              .update()
              .find(Scalar)
              .text(),
          ).toBe(COUNT_GADGET + "sql parametrized"),
        );
      }

      it("should allow seeing an embedded question", async () => {
        if (!embedUrl) {
          throw new Error(
            "This test fails because previous tests didn't produce an embed url.",
          );
        }
        const embedUrlTestStore = await createTestStore({ embedApp: true });
        await runSharedQuestionTests(
          embedUrlTestStore,
          embedUrl,
          new RegExp("/api/embed/card/.*/query"),
        );
      });

      it("should allow seeing a public question", async () => {
        if (!publicUrl) {
          throw new Error(
            "This test fails because previous tests didn't produce a public url.",
          );
        }
        const publicUrlTestStore = await createTestStore({ publicApp: true });
        await runSharedQuestionTests(
          publicUrlTestStore,
          publicUrl,
          new RegExp("/api/public/card/.*/query"),
        );
      });

      // I think it's cleanest to restore the login here so that there are no surprises if you want to add tests
      // that expect that we're already logged in
      afterAll(() => restorePreviousLogin());
    });
  });

  describe("dashboards", () => {
    let publicDashUrl = null;
    let embedDashUrl = null;
    let dashboardId = null;
    let sqlCardId = null;
    let mbqlCardId = null;

    it("should allow creating a public/embedded Dashboard with parameters", async () => {
      // create a Dashboard
      const dashboard = await createDashboard({
        name: "Test Dashboard",
        parameters: [
          { name: "Num", slug: "num", id: "537e37b4", type: "category" },
          {
            name: "People ID",
            slug: "people_id",
            id: "22486e00",
            type: "people_id",
          },
        ],
      });
      dashboardId = dashboard.id;

      // create the 2 Cards we will need
      const sqlCard = await CardApi.create({
        name: "SQL Card",
        display: "scalar",
        visualization_settings: {},
        dataset_query: {
          database: 1,
          type: "native",
          native: {
            query: "SELECT {{num}} AS num",
            template_tags: {
              num: {
                name: "num",
                display_name: "Num",
                type: "number",
                required: true,
                default: 1,
              },
            },
          },
        },
      });
      sqlCardId = sqlCard.id;

      const mbqlCard = await CardApi.create({
        name: "MBQL Card",
        display: "scalar",
        visualization_settings: {},
        dataset_query: {
          database: 1,
          type: "query",
          query: {
            source_table: PEOPLE_TABLE_ID,
            aggregation: ["count"],
          },
        },
      });
      mbqlCardId = mbqlCard.id;

      // add the two Cards to the Dashboard
      const sqlDashcard = await DashboardApi.addcard({
        dashId: dashboard.id,
        cardId: sqlCard.id,
      });
      const mbqlDashcard = await DashboardApi.addcard({
        dashId: dashboard.id,
        cardId: mbqlCard.id,
      });

      // wire up the params for the Cards
      await DashboardApi.reposition_cards({
        dashId: dashboard.id,
        cards: [
          {
            id: sqlDashcard.id,
            card_id: sqlCard.id,
            row: 0,
            col: 0,
            sizeX: 4,
            sizeY: 4,
            series: [],
            visualization_settings: {},
            parameter_mappings: [
              {
                card_id: sqlCard.id,
                target: ["variable", ["template-tag", "num"]],
                parameter_id: "537e37b4",
              },
            ],
          },
          {
            id: mbqlDashcard.id,
            card_id: mbqlCard.id,
            row: 0,
            col: 4,
            sizeX: 4,
            sizeY: 4,
            series: [],
            visualization_settings: {},
            parameter_mappings: [
              {
                card_id: mbqlCard.id,
                target: ["dimension", ["field-id", PEOPLE_ID_FIELD_ID]],
                parameter_id: "22486e00",
              },
            ],
          },
        ],
      });

      // make the Dashboard public + save the URL
      const publicDash = await DashboardApi.createPublicLink({
        id: dashboard.id,
      });
      publicDashUrl = getRelativeUrlWithoutHash(
        Urls.publicDashboard(publicDash.uuid),
      );

      // make the Dashboard embeddable + make params editable + save the URL
      await DashboardApi.update({
        id: dashboard.id,
        embedding_params: {
          num: "enabled",
          people_id: "enabled",
        },
        enable_embedding: true,
      });

      const settings = await SettingsApi.list();
      const secretKey = _.findWhere(settings, { key: "embedding-secret-key" })
        .value;

      const token = jwt.sign(
        {
          resource: {
            dashboard: dashboard.id,
          },
          params: {},
        },
        secretKey,
      );
      embedDashUrl = Urls.embedDashboard(token);
    });

    describe("as an anonymous user", () => {
      beforeAll(() => logout());

      async function runSharedDashboardTests(store, dashUrl) {
        store.pushPath(dashUrl);

        const app = mount(store.getAppContainer());

        const getValueOfCard = index =>
          app
            .update()
            .find(Scalar)
            .find(".ScalarValue")
            .at(index)
            .text();

        const getValueOfSqlCard = () => getValueOfCard(0);
        const getValueOfMbqlCard = () => getValueOfCard(1);

        const waitForDashToReload = async () => {
          // TODO - not sure what the correct way to wait for the cards to reload is
          await store.waitForActions([
            FETCH_DASHBOARD_CARD_DATA,
            FETCH_CARD_DATA,
          ]);
          await delay(500);
        };

        await waitForDashToReload();

        // check that initial value of SQL Card is 1
        await eventually(() => expect(getValueOfSqlCard()).toBe("1"));

        // check that initial value of People Count MBQL Card is 2500 (or whatever people.count is supposed to be)
        await eventually(() => expect(getValueOfMbqlCard()).toBe("2,500"));

        // now set the SQL param to '50' & wait for Dashboard to reload. check that value of SQL Card is updated
        app
          .update()
          .find(TextWidget)
          .first()
          .props()
          .setValue("50");
        await waitForDashToReload();
        await eventually(() => expect(getValueOfSqlCard()).toBe("50"));

        // now set our MBQL param' & wait for Dashboard to reload. check that value of the MBQL Card is updated
        app
          .update()
          .find(ParameterFieldWidget)
          .first()
          .props()
          .setValue("40");
        await waitForDashToReload();
        await eventually(() => expect(getValueOfMbqlCard()).toBe("1"));
      }

      it("should handle parameters in public Dashboards correctly", async () => {
        if (!publicDashUrl) {
          throw new Error(
            "This test fails because test setup code didn't produce a public Dashboard URL.",
          );
        }

        const publicUrlTestStore = await createTestStore({ publicApp: true });
        await runSharedDashboardTests(publicUrlTestStore, publicDashUrl);
      });

      it("should handle parameters in embedded Dashboards correctly", async () => {
        if (!embedDashUrl) {
          throw new Error(
            "This test fails because test setup code didn't produce a embedded Dashboard URL.",
          );
        }

        const embedUrlTestStore = await createTestStore({ embedApp: true });
        await runSharedDashboardTests(embedUrlTestStore, embedDashUrl);
      });
      afterAll(restorePreviousLogin);
    });

    afterAll(() => {
      // delete the Dashboard & Cards we created
      DashboardApi.update({
        id: dashboardId,
        archived: true,
      });
      CardApi.update({
        id: sqlCardId,
        archived: true,
      });
      CardApi.update({
        id: mbqlCardId,
        archived: true,
      });
    });
  });

  afterAll(async () => {
    const store = await createTestStore();

    // Disable public sharing and embedding after running tests
    await store.dispatch(
      updateSetting({ key: "enable-public-sharing", value: false }),
    );
    await store.dispatch(
      updateSetting({ key: "enable-embedding", value: false }),
    );
  });
});
