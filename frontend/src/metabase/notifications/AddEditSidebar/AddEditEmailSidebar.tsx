import cx from "classnames";
import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { scheduleSettingsToCron } from "metabase/admin/performance/utils";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import { Schedule } from "metabase/common/components/Schedule";
import { SendTestPulse } from "metabase/common/components/SendTestPulse";
import { Toggle } from "metabase/common/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { dashboardPulseIsValid } from "metabase/lib/pulse";
import { useSelector } from "metabase/lib/redux";
import { EmailAttachmentPicker } from "metabase/notifications/EmailAttachmentPicker";
import { RecipientPicker } from "metabase/notifications/channels/RecipientPicker";
import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { canAccessSettings } from "metabase/selectors/user";
import { Icon, Title } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Channel,
  ChannelApiResponse,
  Dashboard,
  ScheduleSettings,
  ScheduleType,
  User,
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

interface AddEditEmailSidebarProps {
  pulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  channel: Channel;
  users: User[];
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
  setPulse: (pulse: DraftDashboardSubscription) => void;
  handleArchive: () => void;
  setPulseParameters: (parameters: UiParameter[]) => void;
}

export const AddEditEmailSidebar = ({
  pulse,
  formInput,
  channel,
  users,
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
  setPulse,
  handleArchive,
  setPulseParameters,
}: AddEditEmailSidebarProps) => {
  const isValid = dashboardPulseIsValid(pulse, formInput.channels);
  const userCanAccessSettings = useSelector(canAccessSettings);
  const currentUser = useSelector(getCurrentUser);

  // Return true if the results of all cards can be downloaded
  const allowDownload = pulse.cards?.every(
    (card) => card.download_perms !== DataPermissionValue.NONE,
  );

  useEffect(() => {
    if (isEmbeddingSdk()) {
      onChannelPropertyChange("recipients", [currentUser]);
    }
  }, [currentUser, onChannelPropertyChange]);

  return (
    <Sidebar
      isCloseDisabled={!isValid}
      onClose={handleSave}
      onCancel={onCancel}
    >
      <div className={cx(CS.pt3, CS.px4, CS.flex, CS.alignCenter)}>
        <Icon name="mail" className={CS.mr1} size={21} />
        <Title order={4}>{t`Email this dashboard`}</Title>
      </div>
      {isEmbeddingSdk() ? null : <CaveatMessage />}
      <div
        className={cx(CS.my2, CS.px4, CS.fullHeight, CS.flex, CS.flexColumn)}
      >
        {isEmbeddingSdk() ? null : (
          <div className={CS.pb2}>
            <div className={cx(CS.textBold, CS.mb1)}>{t`To:`}</div>
            <RecipientPicker
              autoFocus={false}
              recipients={channel.recipients}
              users={users}
              onRecipientsChange={(recipients) =>
                onChannelPropertyChange("recipients", recipients)
              }
              invalidRecipientText={(domains) =>
                userCanAccessSettings
                  ? t`You're only allowed to email subscriptions to addresses ending in ${domains}`
                  : t`You're only allowed to email subscriptions to allowed domains`
              }
            />
          </div>
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
          verb={t`Sent`}
          minutesOnHourPicker
          labelAlignment="left"
          className={S.schedule}
          isCustomSchedule={isCustomSchedule}
          onScheduleChange={(nextCronString, nextSchedule) =>
            onChannelScheduleChange(nextCronString, nextSchedule)
          }
        />
        <div className={cx(CS.py2)}>
          <SendTestPulse
            channel={channel}
            channelSpecs={formInput.channels}
            pulse={pulse}
            testPulse={testPulse}
            normalText={t`Send email now`}
            successText={t`Email sent`}
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
            CS.py3,
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
        <EmailAttachmentPicker
          cards={pulse.cards}
          pulse={pulse}
          setPulse={setPulse}
          allowDownload={allowDownload}
        />
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
