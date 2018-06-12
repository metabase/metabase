import {
  createTestStore,
  switchToPlainDatabase,
  BROWSER_HISTORY_REPLACE,
  login,
} from "__support__/integrated_tests";
import {
  chooseSelectOption,
  click,
  clickButton,
  setInputValue,
} from "__support__/enzyme_utils";

import {
  COMPLETE_SETUP,
  SET_ACTIVE_STEP,
  SET_ALLOW_TRACKING,
  SET_DATABASE_DETAILS,
  SET_USER_DETAILS,
  SUBMIT_SETUP,
  VALIDATE_PASSWORD,
} from "metabase/setup/actions";

import path from "path";
import { mount } from "enzyme";
import Setup from "metabase/setup/components/Setup";
import { delay } from "metabase/lib/promise";
import UserStep from "metabase/setup/components/UserStep";
import DatabaseConnectionStep from "metabase/setup/components/DatabaseConnectionStep";
import PreferencesStep from "metabase/setup/components/PreferencesStep";
import Toggle from "metabase/components/Toggle";
import FormField from "metabase/components/form/FormField";
import DatabaseSchedulingStep from "metabase/setup/components/DatabaseSchedulingStep";
import { SyncOption } from "metabase/admin/databases/components/DatabaseSchedulingForm";
import { FETCH_ACTIVITY } from "metabase/home/actions";
import NewUserOnboardingModal from "metabase/home/components/NewUserOnboardingModal";
import StepIndicators from "metabase/components/StepIndicators";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
describe("setup wizard", () => {
  let store = null;
  let app = null;

  const email = "testy@metabase.com";
  const strongPassword =
    "QJbHYJN3tPW[29AoBM3#rsfB4@hshp>gC8mDmUTtbGTfExY]#nBjmtX@NmEJwxBc";

  beforeAll(async () => {
    switchToPlainDatabase();
    store = await createTestStore();
    store.pushPath("/");
    app = mount(store.getAppContainer());
  });

  it("should start from the welcome page", async () => {
    await store.waitForActions([BROWSER_HISTORY_REPLACE]);
    expect(store.getPath()).toBe("/setup");
    expect(
      app
        .find(Setup)
        .find("h1")
        .text(),
    ).toBe("Welcome to Metabase");
  });

  it("should allow you to create an account", async () => {
    clickButton(app.find(".Button.Button--primary"));
    await store.waitForActions([SET_ACTIVE_STEP]);

    const userStep = app.find(UserStep);
    expect(userStep.find(".SetupStep--active").length).toBe(1);

    const nextButton = userStep.find('button[children="Next"]');
    expect(nextButton.props().disabled).toBe(true);

    setInputValue(userStep.find('input[name="first_name"]'), "Testy");
    setInputValue(userStep.find('input[name="last_name"]'), "McTestface");
    setInputValue(userStep.find('input[name="email"]'), email);
    setInputValue(userStep.find('input[name="site_name"]'), "Epic Team");

    // test first with a weak password
    setInputValue(userStep.find('input[name="password"]'), "password");
    await store.waitForActions([VALIDATE_PASSWORD]);
    setInputValue(userStep.find('input[name="password_confirm"]'), "password");

    // the form shouldn't be valid yet
    expect(nextButton.props().disabled).toBe(true);

    // then with a strong password, generated with my beloved password manager
    setInputValue(userStep.find('input[name="password"]'), strongPassword);
    await store.waitForActions([VALIDATE_PASSWORD]);
    setInputValue(
      userStep.find('input[name="password_confirm"]'),
      strongPassword,
    );

    // Due to the chained setState calls in UserStep we have to add a tiny delay here
    await delay(500);

    expect(nextButton.props().disabled).toBe(false);
    clickButton(nextButton);
    await store.waitForActions([SET_USER_DETAILS]);
    expect(
      app.find(DatabaseConnectionStep).find(".SetupStep--active").length,
    ).toBe(1);

    // test that you can return to user settings if you want
    click(userStep.find("h3"));
    const newUserStep = app.find(UserStep);
    expect(newUserStep.find(".SetupStep--active").length).toBe(1);
    expect(userStep.find('input[name="first_name"]').prop("defaultValue")).toBe(
      "Testy",
    );
    expect(userStep.find('input[name="password"]').prop("defaultValue")).toBe(
      strongPassword,
    );

    // re-enter database settings after that
    clickButton(newUserStep.find('button[children="Next"]'));
    await store.waitForActions([SET_ACTIVE_STEP]);
  });

  it("should allow you to set connection settings for a new database", async () => {
    // Try to address a rare test failure where `chooseSelectOption` fails because it couldn't find its parent option
    app.update();

    const databaseStep = app.find(DatabaseConnectionStep);
    expect(databaseStep.find(".SetupStep--active").length).toBe(1);

    // add h2 database
    chooseSelectOption(app.find("option[value='h2']"));
    setInputValue(databaseStep.find("input[name='name']"), "Metabase H2");

    const nextButton = databaseStep.find('button[children="Next"]');
    expect(nextButton.props().disabled).toBe(true);

    const dbPath = path.resolve(__dirname, "../__runner__/empty.db");
    setInputValue(databaseStep.find("input[name='db']"), `file:${dbPath}`);

    expect(nextButton.props().disabled).toBe(undefined);
    clickButton(nextButton);
    await store.waitForActions([SET_DATABASE_DETAILS]);

    const preferencesStep = app.find(PreferencesStep);
    expect(preferencesStep.find(".SetupStep--active").length).toBe(1);
  });

  it('should show you scheduling step if you select "Let me choose when Metabase syncs and scans"', async () => {
    // we can conveniently test returning to database settings now as well
    const connectionStep = app.find(DatabaseConnectionStep);
    click(connectionStep.find("h3"));
    expect(connectionStep.find(".SetupStep--active").length).toBe(1);

    const letUserControlSchedulingToggle = connectionStep
      .find(FormField)
      .filterWhere(f => f.props().fieldName === "let-user-control-scheduling")
      .find(Toggle);

    expect(letUserControlSchedulingToggle.length).toBe(1);
    expect(letUserControlSchedulingToggle.prop("value")).toBe(false);
    click(letUserControlSchedulingToggle);
    expect(letUserControlSchedulingToggle.prop("value")).toBe(true);

    const nextButton = connectionStep.find('button[children="Next"]');
    clickButton(nextButton);
    await store.waitForActions([SET_DATABASE_DETAILS]);

    const schedulingStep = app.find(DatabaseSchedulingStep);
    expect(schedulingStep.find(".SetupStep--active").length).toBe(1);

    // disable the deep analysis
    const syncOptions = schedulingStep.find(SyncOption);
    const syncOptionsNever = syncOptions.at(1);
    click(syncOptionsNever);

    // proceed to tracking preferences step again
    const nextButton2 = schedulingStep.find('button[children="Next"]');
    clickButton(nextButton2);
    await store.waitForActions([SET_DATABASE_DETAILS]);
  });

  it("should let you opt in/out from user tracking", async () => {
    const preferencesStep = app.find(PreferencesStep);
    expect(preferencesStep.find(".SetupStep--active").length).toBe(1);

    // tracking is enabled by default
    const trackingToggle = preferencesStep.find(Toggle);
    expect(trackingToggle.prop("value")).toBe(true);

    click(trackingToggle);
    await store.waitForActions([SET_ALLOW_TRACKING]);
    expect(trackingToggle.prop("value")).toBe(false);
  });

  // NOTE Atte Keinänen 8/15/17:
  // If you want to develop tests incrementally, you should disable this step as this will complete the setup
  // That is an irreversible action (you have to nuke the db in order to see the setup screen again)
  it("should let you finish setup and subscribe to newsletter", async () => {
    const preferencesStep = app.find(PreferencesStep);
    const nextButton = preferencesStep.find('button[children="Next"]');
    clickButton(nextButton);
    await store.waitForActions([COMPLETE_SETUP, SUBMIT_SETUP]);

    const allSetUpSection = app.find(".SetupStep").last();
    expect(allSetUpSection.find(".SetupStep--active").length).toBe(1);

    expect(allSetUpSection.find('a[href="/"]').length).toBe(1);
  });

  // NOTE: disabling until we determine a new onboarding flow
  xit("should show you the onboarding modal", async () => {
    // we can't persist the cookies of previous step so do the login manually here
    await login({ username: email, password: strongPassword });
    // redirect to `?new` caused some trouble in tests so create a new store for testing the modal interaction
    const loggedInStore = await createTestStore();
    loggedInStore.pushPath("/?new");
    const loggedInApp = mount(loggedInStore.getAppContainer());

    await loggedInStore.waitForActions([FETCH_ACTIVITY]);

    const modal = loggedInApp.find(NewUserOnboardingModal);
    const stepIndicators = modal.find(StepIndicators);
    expect(modal.length).toBe(1);
    expect(stepIndicators.prop("currentStep")).toBe(1);

    click(modal.find('a[children="Next"]'));
    expect(stepIndicators.prop("currentStep")).toBe(2);

    click(modal.find('a[children="Next"]'));
    expect(stepIndicators.prop("currentStep")).toBe(3);

    click(modal.find('a[children="Let\'s go"]'));
    expect(loggedInApp.find(NewUserOnboardingModal).length).toBe(0);
  });

  afterAll(async () => {
    // The challenge with setup guide test is that you can't reset the db to the initial state
  });
});
