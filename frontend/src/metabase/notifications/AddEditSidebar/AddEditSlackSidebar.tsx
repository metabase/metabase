import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import { scheduleSettingsToCron } from "metabase/admin/performance/utils";
import { Schedule } from "metabase/common/components/Schedule";
import { SendTestPulse } from "metabase/common/components/SendTestPulse";
import { Toggle } from "metabase/common/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { dashboardPulseIsValid } from "metabase/lib/pulse";
import { SlackChannelField } from "metabase/notifications/channels/SlackChannelField";
import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { Icon, Title } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Channel,
  ChannelApiResponse,
  ChannelSpec,
  ChannelSpecs,
  Dashboard,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";
import type { DraftDashboardSubscription } from "metabase-types/store";

import S from "./AddEditSidebar.module.css";
import { CaveatMessage } from "./CaveatMessage";
import DefaultParametersSection from "./DefaultParametersSection";
import { DeleteSubscriptionAction } from "./DeleteSubscriptionAction";
import { CHANNEL_NOUN_PLURAL } from "./constants";
import Heading from "./Heading";

const SUBSCRIPTION_SCHEDULE_OPTIONS: ScheduleType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
];

interface AddEditSlackSidebarProps {
  pulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  channel: Channel;
  channelSpec: ChannelSpec;
  parameters: UiParameter[];
  hiddenParameters?: string;
  dashboard: Dashboard;
  cronString?: string;
  isCustomSchedule?: boolean;
  handleSave: () => void;
  onCancel: () => void;
  onChannelPropertyChange: (property: string, value: unknown) => void;
  onChannelScheduleChange: (
    cronString: string,
    schedule: ScheduleSettings,
  ) => void;
  testPulse: (pulse: DraftDashboardSubscription) => Promise<unknown>;
  toggleSkipIfEmpty: () => void;
  handleArchive: () => void;
  setPulseParameters: (parameters: UiParameter[]) => void;
}

export const AddEditSlackSidebar = ({
  pulse,
  formInput,
  channel,
  channelSpec,
  parameters,
  hiddenParameters,
  dashboard,
  cronString: cronStringProp,
  isCustomSchedule,
  // form callbacks
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  testPulse,
  toggleSkipIfEmpty,
  handleArchive,
  setPulseParameters,
}: AddEditSlackSidebarProps) => {
  const isValid = dashboardPulseIsValid(
    pulse,
    formInput.channels as ChannelSpecs,
  );

  return (
    <Sidebar
      isCloseDisabled={!isValid}
      onClose={handleSave}
      onCancel={onCancel}
    >
      <div className={cx(CS.pt4, CS.flex, CS.alignCenter, CS.px4)}>
        <Icon name="slack" className={CS.mr1} size={21} />
        <Title order={4}>{t`Send this dashboard to Slack`}</Title>
      </div>
      <CaveatMessage />
      <div
        className={cx(CS.my2, CS.px4, CS.fullHeight, CS.flex, CS.flexColumn)}
      >
        {channelSpec.fields && (
          <SlackChannelField
            channel={channel}
            channelSpec={channelSpec}
            onChannelPropertyChange={onChannelPropertyChange}
          />
        )}
        <Schedule
          cronString={
            cronStringProp ??
            scheduleSettingsToCron(
              _.pick(
                channel,
                "schedule_day",
                "schedule_frame",
                "schedule_hour",
                "schedule_type",
                "schedule_minute",
              ),
            )
          }
          scheduleOptions={SUBSCRIPTION_SCHEDULE_OPTIONS}
          verb={t`Send`}
          minutesOnHourPicker
          labelAlignment="left"
          className={S.schedule}
          isCustomSchedule={isCustomSchedule}
          onScheduleChange={(nextCronString, nextSchedule) =>
            onChannelScheduleChange(nextCronString, nextSchedule)
          }
        />
        <div className={cx(CS.pt2, CS.pb1)}>
          <SendTestPulse
            channel={channel}
            channelSpecs={formInput.channels}
            pulse={pulse}
            testPulse={testPulse}
            normalText={t`Send to Slack now`}
            successText={t`Slack sent`}
            disabled={!isValid}
          />
        </div>

        {PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component ? (
          <PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component
            className={cx(CS.py3, CS.mt2, CS.borderTop)}
            parameters={parameters}
            hiddenParameters={hiddenParameters}
            dashboard={dashboard}
            pulse={pulse}
            setPulseParameters={setPulseParameters}
          />
        ) : (
          <DefaultParametersSection
            className={cx(CS.py3, CS.mt2, CS.borderTop)}
            parameters={parameters}
          />
        )}
        <div
          className={cx(
            CS.textBold,
            CS.py2,
            CS.flex,
            CS.justifyBetween,
            CS.alignCenter,
            CS.borderTop,
          )}
        >
          <Title order={4}>{t`Don't send if there aren't results`}</Title>
          <Toggle
            value={pulse.skip_if_empty || false}
            onChange={toggleSkipIfEmpty}
          />
        </div>
        {pulse.id != null && (
          <DeleteSubscriptionAction
            pulse={pulse}
            handleArchive={handleArchive}
          />
        )}
        <div className={cx(CS.p2, CS.mtAuto, CS.textSmall, CS.textMedium)}>
          {t`Charts in subscriptions may look slightly different from charts in dashboards.`}
        </div>
      </div>
    </Sidebar>
  );
};
