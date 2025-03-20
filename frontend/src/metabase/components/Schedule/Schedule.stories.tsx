import type { Store } from "@reduxjs/toolkit";
import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";
import { t } from "ttag";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { publicReducers } from "metabase/reducers-public";
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

const Template: StoryFn<typeof Schedule> = args => {
  const [
    {
      schedule,
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
    },
    updateArgs,
  ] = useArgs();

  const verb = longVerb ? t`Clear cache for this dashboard` : t`Send`;
  const handleChange = (schedule: unknown) => updateArgs({ schedule });
  return (
    <LocaleProvider locale={locale}>
      <Schedule
        {...args}
        verb={verb}
        schedule={schedule}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        onScheduleChange={handleChange}
      />
    </LocaleProvider>
  );
};

const defaultSchedule = {
  schedule_day: "mon",
  schedule_frame: null,
  schedule_hour: 0,
  schedule_type: "daily",
};

export const Default = {
  render: Template,

  args: {
    schedule: defaultSchedule,
    longVerb: false,
    locale: "en",
  },
};

export const LongVerb = {
  render: Template,
  args: {
    schedule: defaultSchedule,
    longVerb: true,
    locale: "en",
  },
};

export const EveryNMinutes = {
  render: Template,
  args: {
    schedule: {
      schedule_type: "every_n_minutes",
      shedule_hour: null,
      schedule_minute: 15,
    },
    longVerb: false,
    locale: "en",
  },
};

export const HourlyOnSpecificMinute = {
  render: Template,
  args: {
    schedule: {
      schedule_type: "hourly",
      schedule_hour: null,
      schedule_minute: 10,
    },
    longVerb: false,
    locale: "en",
    minutesOnHourPicker: true,
  },
};
