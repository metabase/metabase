import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";
import { t } from "ttag";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { publicReducers } from "metabase/reducers-public";
import type { ScheduleSettings } from "metabase-types/api";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { Schedule } from "./Schedule";

const storeInitialState = createMockState({
  settings: mockSettings(),
  entities: createMockEntitiesState({}),
});
const publicReducerNames = Object.keys(publicReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;
const reducers = publicReducers;

const storeMiddleware = [Api.middleware];

const store = getStore(
  reducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
};

export default {
  title: "Components/Inputs/Schedule",
  component: Schedule,
  decorators: [ReduxDecorator],
};

const Template: StoryFn<typeof Schedule> = (args) => {
  const [
    {
      cronString,
      scheduleOptions = [
        "every_n_minutes",
        "hourly",
        "daily",
        "weekly",
        "monthly",
      ],
      timezone = "UTC",
      locale = "en",
      longVerb = false,
      isCustomSchedule = false,
    },
    updateArgs,
  ] = useArgs();

  const verb = longVerb ? t`Clear cache for this dashboard` : t`Send`;
  const handleChange = (cronString: string, schedule: ScheduleSettings) =>
    updateArgs({
      cronString,
      isCustomSchedule: schedule.schedule_type === "cron",
    });
  return (
    <LocaleProvider locale={locale}>
      <Schedule
        {...args}
        verb={verb}
        cronString={cronString}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        onScheduleChange={handleChange}
        isCustomSchedule={isCustomSchedule}
      />
    </LocaleProvider>
  );
};

export const Default = {
  render: Template,

  args: {
    cronString: "0 0 9 * * ? *",
    longVerb: false,
    locale: "en",
  },
};

export const LongVerb = {
  render: Template,
  args: {
    cronString: "0 0 9 * * ? *",
    longVerb: true,
    locale: "en",
  },
};

export const EveryNMinutes = {
  render: Template,
  args: {
    cronString: "0 0/10 * * * ? *",
    longVerb: false,
    locale: "en",
  },
};

export const HourlyOnSpecificMinute = {
  render: Template,
  args: {
    cronString: "0 10 * * * ? *",
    longVerb: false,
    locale: "en",
    minutesOnHourPicker: true,
  },
};

export const CustomSchedule = {
  render: Template,
  args: {
    cronString: "0 10 10 * * ? *",
    scheduleOptions: [
      "every_n_minutes",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "cron",
    ],
    isCustomSchedule: true,
    renderScheduleDescription: (
      schedule: ScheduleSettings,
      cronString: string,
    ) => {
      return (
        <ul style={{ marginTop: "1rem" }}>
          <li>
            Demo of <code>renderScheduleDescription</code>:
          </li>
          <li>Cron String: {cronString}</li>
          <li>Schedule updated on blur: {JSON.stringify(schedule)}</li>
        </ul>
      );
    },
    locale: "en",
    labelAlignment: "left",
  },
};
