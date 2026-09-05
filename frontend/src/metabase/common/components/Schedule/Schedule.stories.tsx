import type { Store } from "@reduxjs/toolkit";
import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";
import { t } from "ttag";

import { getPublicStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { MetabaseReduxProvider } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";

import { Schedule } from "./Schedule";
import { cronToBuilderValue } from "./cron";
import type { ScheduleValue } from "./domain";

const storeInitialState = createMockState({
  settings: mockSettings(),
  entities: createMockEntitiesState({}),
});
// Unjustified type cast. FIXME
const store = getPublicStore(storeInitialState) as unknown as Store<State>;

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
      value,
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

  return (
    <LocaleProvider locale={locale}>
      <Schedule
        {...args}
        verb={verb}
        value={value}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        onScheduleChange={updateArgs}
      />
    </LocaleProvider>
  );
};

export const Default = {
  render: Template,

  args: {
    value: cronToBuilderValue("0 0 9 * * ? *"),
    longVerb: false,
    locale: "en",
  },
};

export const LongVerb = {
  render: Template,
  args: {
    value: cronToBuilderValue("0 0 9 * * ? *"),
    longVerb: true,
    locale: "en",
  },
};

export const EveryNMinutes = {
  render: Template,
  args: {
    value: cronToBuilderValue("0 0/10 * * * ? *"),
    longVerb: false,
    locale: "en",
  },
};

export const HourlyOnSpecificMinute = {
  render: Template,
  args: {
    value: cronToBuilderValue("0 10 * * * ? *"),
    longVerb: false,
    locale: "en",
    minutesOnHourPicker: true,
  },
};

export const CustomSchedule = {
  render: Template,
  args: {
    value: { schedule_type: "cron", cron: "0 10 10 * * ? *" },
    scheduleOptions: [
      "every_n_minutes",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "cron",
    ],
    renderScheduleDescription: (value: ScheduleValue, cronString: string) => {
      return (
        <ul style={{ marginTop: "1rem" }}>
          <li>
            Demo of <code>renderScheduleDescription</code>:
          </li>
          <li>Cron String: {cronString}</li>
          <li>Schedule updated on blur: {JSON.stringify(value)}</li>
        </ul>
      );
    },
    locale: "en",
    labelAlignment: "left",
  },
};
