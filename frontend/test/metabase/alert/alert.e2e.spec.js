import {
  createSavedQuestion,
  createTestStore,
  createAllUsersWritableCollection,
  forBothAdminsAndNormalUsers,
  useSharedAdminLogin,
  useSharedNormalLogin,
} from "__support__/e2e";
import { click, clickButton } from "__support__/enzyme";

import { fetchTableMetadata } from "metabase/redux/metadata";
import { mount } from "enzyme";
import { setIn } from "icepick";
import {
  AlertApi,
  CardApi,
  PulseApi,
  UserApi,
  CollectionsApi,
} from "metabase/services";
import Question from "metabase-lib/lib/Question";
import * as Urls from "metabase/lib/urls";
import { INITIALIZE_QB, QUERY_COMPLETED } from "metabase/query_builder/actions";
import { delay } from "metabase/lib/promise";
import {
  AlertEducationalScreen,
  AlertSettingToggle,
  CreateAlertModalContent,
  MultiSeriesAlertTip,
  NormalAlertTip,
  RawDataAlertTip,
  UpdateAlertModalContent,
} from "metabase/query_builder/components/AlertModals";
import Button from "metabase/components/Button";
import {
  CREATE_ALERT,
  FETCH_ALERTS_FOR_QUESTION,
  UNSUBSCRIBE_FROM_ALERT,
  UPDATE_ALERT,
} from "metabase/alert/alert";
import MetabaseCookies from "metabase/lib/cookies";
import Radio from "metabase/components/Radio";
import { getQuestionAlerts } from "metabase/query_builder/selectors";
import { FETCH_PULSE_FORM_INPUT } from "metabase/pulse/actions";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import { getDefaultAlert } from "metabase-lib/lib/Alert";
import { getMetadata } from "metabase/selectors/metadata";
import AlertListPopoverContent, {
  AlertListItem,
} from "metabase/query_builder/components/AlertListPopoverContent";

import Users from "metabase/entities/users";

async function removeAllCreatedAlerts() {
  useSharedAdminLogin();
  const alerts = await AlertApi.list();
  await Promise.all(alerts.map(alert => AlertApi.delete({ id: alert.id })));
}

const initQbWithAlertMenuItemClicked = async (
  question,
  { hasSeenAlertSplash = true } = {},
) => {
  MetabaseCookies.getHasSeenAlertSplash = () => hasSeenAlertSplash;

  const store = await createTestStore();
  store.pushPath(Urls.question(question.id()));
  const app = mount(store.getAppContainer());

  await store.waitForActions([
    INITIALIZE_QB,
    QUERY_COMPLETED,
    FETCH_ALERTS_FOR_QUESTION,
  ]);
  await delay(500);
  clickAlertWidget(app);
  await delay(10);

  return { store, app };
};

function clickAlertWidget(app) {
  click(app.find(".Icon-bell"));
}

function getAlertModal(app) {
  return app.find(".test-modal");
}

describe("Alerts", () => {
  let collection = null;
  let rawDataQuestion = null;
  let timeSeriesQuestion = null;
  let timeSeriesWithGoalQuestion = null;
  let timeMultiSeriesWithGoalQuestion = null;
  let progressBarQuestion = null;

  beforeAll(async () => {
    useSharedAdminLogin();

    const store = await createTestStore();

    // create a collection which all users have write permissions in
    collection = await createAllUsersWritableCollection();

    // table metadata is needed for `Question.alertType()` calls
    await store.dispatch(fetchTableMetadata(1));
    const metadata = getMetadata(store.getState());

    rawDataQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata })
        .query()
        .filter(["=", ["field-id", 4], 123456])
        .question()
        .setDisplayName("Just raw, untamed data")
        .setCollectionId(collection.id),
    );

    timeSeriesQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata })
        .query()
        .aggregate(["count"])
        .breakout(["datetime-field", ["field-id", 1], "month"])
        .question()
        .setDisplay("line")
        .setSettings({
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        })
        .setDisplayName("Time series line")
        .setCollectionId(collection.id),
    );

    timeSeriesWithGoalQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata })
        .query()
        .aggregate(["count"])
        .breakout(["datetime-field", ["field-id", 1], "month"])
        .question()
        .setDisplay("line")
        .setSettings({
          "graph.show_goal": true,
          "graph.goal_value": 10,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        })
        .setDisplayName("Time series line with goal")
        .setCollectionId(collection.id),
    );

    timeMultiSeriesWithGoalQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata })
        .query()
        .aggregate(["count"])
        .aggregate(["sum", ["field-id", 6]])
        .breakout(["datetime-field", ["field-id", 1], "month"])
        .question()
        .setDisplay("line")
        .setSettings({
          "graph.show_goal": true,
          "graph.goal_value": 10,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count", "sum"],
        })
        .setDisplayName("Time multiseries line with goal")
        .setCollectionId(collection.id),
    );

    progressBarQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata })
        .query()
        .aggregate(["count"])
        .question()
        .setDisplay("progress")
        .setSettings({ "progress.goal": 50 })
        .setDisplayName("Progress bar question")
        .setCollectionId(collection.id),
    );
  });

  afterAll(async () => {
    await CardApi.delete({ cardId: rawDataQuestion.id() });
    await CardApi.delete({ cardId: timeSeriesQuestion.id() });
    await CardApi.delete({ cardId: timeSeriesWithGoalQuestion.id() });
    await CardApi.delete({ cardId: timeMultiSeriesWithGoalQuestion.id() });
    await CardApi.delete({ cardId: progressBarQuestion.id() });
    await CollectionsApi.update({ id: collection.id, archived: true });
  });

  describe("missing email/slack credentials", () => {
    forBothAdminsAndNormalUsers(() => {
      it("should prompt you to add email/slack credentials", async () => {
        MetabaseCookies.getHasSeenAlertSplash = () => false;

        const store = await createTestStore();
        store.pushPath(Urls.question(rawDataQuestion.id()));
        const app = mount(store.getAppContainer());

        await store.waitForActions([
          INITIALIZE_QB,
          QUERY_COMPLETED,
          FETCH_ALERTS_FOR_QUESTION,
        ]);

        clickAlertWidget(app);

        await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
        const alertModal = getAlertModal(app);
        expect(alertModal.find(ChannelSetupModal).length).toBe(1);
      });
    });
  });

  describe("with only slack set", () => {
    const normalFormInput = PulseApi.form_input;
    beforeAll(async () => {
      const formInput = await PulseApi.form_input();
      PulseApi.form_input = () => ({
        channels: {
          ...formInput.channels,
          slack: {
            ...formInput.channels.slack,
            configured: true,
          },
        },
      });
    });
    afterAll(() => {
      PulseApi.form_input = normalFormInput;
    });

    it("should let admins create alerts", async () => {
      useSharedAdminLogin();
      const store = await createTestStore();
      store.pushPath(Urls.question(rawDataQuestion.id()));
      const app = mount(store.getAppContainer());

      await store.waitForActions([
        INITIALIZE_QB,
        QUERY_COMPLETED,
        FETCH_ALERTS_FOR_QUESTION,
      ]);

      clickAlertWidget(app);

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      expect(alertModal.find(ChannelSetupModal).length).toBe(0);
      expect(alertModal.find(AlertEducationalScreen).length).toBe(1);
    });

    it("should say to non-admins that admin must add email credentials", async () => {
      useSharedNormalLogin();
      const store = await createTestStore();
      store.pushPath(Urls.question(rawDataQuestion.id()));
      const app = mount(store.getAppContainer());

      await store.waitForActions([
        INITIALIZE_QB,
        QUERY_COMPLETED,
        FETCH_ALERTS_FOR_QUESTION,
      ]);

      clickAlertWidget(app);

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      expect(alertModal.find(ChannelSetupModal).length).toBe(1);
      expect(alertModal.find(ChannelSetupModal).prop("channels")).toEqual([
        "email",
      ]);
    });
  });

  describe("alert creation", () => {
    const normalFormInput = PulseApi.form_input;
    beforeAll(async () => {
      // all channels configured
      const formInput = await PulseApi.form_input();
      PulseApi.form_input = () => ({
        channels: {
          ...formInput.channels,
          email: {
            ...formInput.channels.email,
            configured: true,
          },
          slack: {
            ...formInput.channels.slack,
            configured: true,
          },
        },
      });
    });
    afterAll(async () => {
      PulseApi.form_input = normalFormInput;
      await removeAllCreatedAlerts();
    });

    it("should show you the first time educational screen", async () => {
      useSharedNormalLogin();
      const { app, store } = await initQbWithAlertMenuItemClicked(
        rawDataQuestion,
        { hasSeenAlertSplash: false },
      );

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      const educationalScreen = alertModal.find(AlertEducationalScreen);

      clickButton(educationalScreen.find(Button));
      const creationScreen = alertModal.find(CreateAlertModalContent);
      expect(creationScreen.length).toBe(1);
    });

    it("should support 'rows present' alert for raw data questions", async () => {
      useSharedNormalLogin();
      const { app, store } = await initQbWithAlertMenuItemClicked(
        rawDataQuestion,
      );

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      const creationScreen = alertModal.find(CreateAlertModalContent);
      expect(creationScreen.find(RawDataAlertTip).length).toBe(1);
      expect(creationScreen.find(NormalAlertTip).length).toBe(1);
      expect(creationScreen.find(AlertSettingToggle).length).toBe(0);

      clickButton(creationScreen.find(".Button.Button--primary"));
      await store.waitForActions([CREATE_ALERT]);
    });

    it("should support 'rows present' alert for timeseries questions without a goal", async () => {
      useSharedNormalLogin();
      const { app, store } = await initQbWithAlertMenuItemClicked(
        timeSeriesQuestion,
      );

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      const creationScreen = alertModal.find(CreateAlertModalContent);
      expect(creationScreen.find(RawDataAlertTip).length).toBe(1);
      expect(creationScreen.find(AlertSettingToggle).length).toBe(0);
    });

    it("should work for timeseries questions with a set goal", async () => {
      useSharedNormalLogin();
      const { app, store } = await initQbWithAlertMenuItemClicked(
        timeSeriesWithGoalQuestion,
      );

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      // why sometimes the educational screen is shown for a second ...?
      expect(alertModal.find(AlertEducationalScreen).length).toBe(0);

      const creationScreen = alertModal.find(CreateAlertModalContent);
      expect(creationScreen.find(RawDataAlertTip).length).toBe(0);

      const toggles = creationScreen.find(AlertSettingToggle);
      expect(toggles.length).toBe(2);

      const aboveGoalToggle = toggles.at(0);
      expect(aboveGoalToggle.find(Radio).prop("value")).toBe(true);
      click(aboveGoalToggle.find("li").last());
      expect(aboveGoalToggle.find(Radio).prop("value")).toBe(false);

      const firstOnlyToggle = toggles.at(1);
      expect(firstOnlyToggle.find(Radio).prop("value")).toBe(true);

      click(creationScreen.find(".Button.Button--primary"));
      await store.waitForActions([CREATE_ALERT]);

      const alert = Object.values(getQuestionAlerts(store.getState()))[0];
      expect(alert.alert_above_goal).toBe(false);
      expect(alert.alert_first_only).toBe(true);
    });

    it("should fall back to raw data alert and show a warning for time-multiseries questions with a set goal", async () => {
      useSharedNormalLogin();
      const { app, store } = await initQbWithAlertMenuItemClicked(
        timeMultiSeriesWithGoalQuestion,
      );

      await store.waitForActions([FETCH_PULSE_FORM_INPUT]);
      const alertModal = getAlertModal(app);
      const creationScreen = alertModal.find(CreateAlertModalContent);
      // console.log(creationScreen.debug())
      expect(creationScreen.find(RawDataAlertTip).length).toBe(1);
      expect(creationScreen.find(MultiSeriesAlertTip).length).toBe(1);
      expect(creationScreen.find(AlertSettingToggle).length).toBe(0);

      clickButton(creationScreen.find(".Button.Button--primary"));
      await store.waitForActions([CREATE_ALERT]);
    });
  });

  describe("alert list for a question", () => {
    beforeAll(async () => {
      // Both raw data and timeseries questions contain both an alert created by a normal user and by an admin.
      // The difference is that the admin-created alert in raw data question contains also the normal user
      // as a recipient.
      useSharedAdminLogin();
      const adminUser = await UserApi.current();
      await AlertApi.create(
        getDefaultAlert(timeSeriesWithGoalQuestion, adminUser),
      );

      useSharedNormalLogin();
      const normalUser = await UserApi.current();
      await AlertApi.create(
        getDefaultAlert(timeSeriesWithGoalQuestion, normalUser),
      );
      await AlertApi.create(getDefaultAlert(rawDataQuestion, normalUser));

      useSharedAdminLogin();
      const defaultRawDataAlert = getDefaultAlert(rawDataQuestion, adminUser);
      const alertWithTwoRecipients = setIn(
        defaultRawDataAlert,
        ["channels", 0, "recipients"],
        [adminUser, normalUser],
      );
      await AlertApi.create(alertWithTwoRecipients);
    });

    afterAll(async () => {
      await removeAllCreatedAlerts();
    });

    describe("as an admin", () => {
      it("should let you see all created alerts", async () => {
        useSharedAdminLogin();
        const { app } = await initQbWithAlertMenuItemClicked(
          timeSeriesWithGoalQuestion,
        );

        const alertListPopover = app.find(AlertListPopoverContent);

        const alertListItems = alertListPopover.find(AlertListItem);
        expect(alertListItems.length).toBe(2);
        expect(alertListItems.at(1).text()).toMatch(/Robert/);
      });

      it("should let you edit an alert", async () => {
        // let's in this case try editing someone else's alert
        useSharedAdminLogin();
        const { app, store } = await initQbWithAlertMenuItemClicked(
          timeSeriesWithGoalQuestion,
        );

        const alertListPopover = app.find(AlertListPopoverContent);

        const alertListItems = alertListPopover.find(AlertListItem);
        expect(alertListItems.length).toBe(2);
        expect(alertListItems.at(1).text()).toMatch(/Robert/);

        const othersAlertListItem = alertListItems.at(1);

        click(
          othersAlertListItem
            .find("a")
            .filterWhere(item => /Edit/.test(item.text())),
        );

        const editingScreen = app.find(UpdateAlertModalContent);
        expect(editingScreen.length).toBe(1);

        await store.waitForActions([
          Users.actionTypes.FETCH_LIST,
          FETCH_PULSE_FORM_INPUT,
        ]);

        const toggles = editingScreen.find(AlertSettingToggle);
        const aboveGoalToggle = toggles.at(0);
        expect(aboveGoalToggle.find(Radio).prop("value")).toBe(true);
        click(aboveGoalToggle.find("li").last());
        expect(aboveGoalToggle.find(Radio).prop("value")).toBe(false);

        click(editingScreen.find(".Button.Button--primary").last());
        await store.waitForActions([UPDATE_ALERT]);

        const alerts = Object.values(getQuestionAlerts(store.getState()));
        const othersAlert = alerts.find(alert => alert.creator_id === 2);
        expect(othersAlert.alert_above_goal).toBe(false);
      });
    });

    describe("as a non-admin / normal user", () => {
      it("should let you see your own alerts", async () => {
        useSharedNormalLogin();
        const { app } = await initQbWithAlertMenuItemClicked(
          timeSeriesWithGoalQuestion,
        );

        const alertListPopover = app.find(AlertListPopoverContent);

        const alertListItems = alertListPopover.find(AlertListItem);
        expect(alertListItems.length).toBe(1);
      });

      it("should let you see also other alerts where you are a recipient", async () => {
        useSharedNormalLogin();
        const { app } = await initQbWithAlertMenuItemClicked(rawDataQuestion);

        const alertListPopover = app.find(AlertListPopoverContent);

        const alertListItems = alertListPopover.find(AlertListItem);
        expect(alertListItems.length).toBe(2);
        expect(alertListItems.at(1).text()).toMatch(/Bobby/);
      });

      it("should let you unsubscribe from both your own and others' alerts", async () => {
        useSharedNormalLogin();
        const { app, store } = await initQbWithAlertMenuItemClicked(
          rawDataQuestion,
        );

        const alertListPopover = app.find(AlertListPopoverContent);
        const alertListItems = alertListPopover.find(AlertListItem);
        expect(alertListItems.length).toBe(2);
        const ownAlertListItem = alertListItems.at(0);
        // const otherAlertListItem = alertListItems.at(1)

        // unsubscribe from the alert of some other user
        click(
          ownAlertListItem
            .find("a")
            .filterWhere(item => /Unsubscribe/.test(item.text())),
        );
        await store.waitForActions([UNSUBSCRIBE_FROM_ALERT]);
      });
    });
  });
});
