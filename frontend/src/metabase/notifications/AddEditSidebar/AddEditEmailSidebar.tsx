import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import SendTestPulse from "metabase/components/SendTestPulse";
import SchedulePicker, {
  type ScheduleChangeProp,
} from "metabase/containers/SchedulePicker";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { dashboardPulseIsValid } from "metabase/lib/pulse";
import EmailAttachmentPicker from "metabase/notifications/EmailAttachmentPicker";
import { RecipientPicker } from "metabase/notifications/channels/RecipientPicker";
import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { Icon } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Channel,
  ChannelApiResponse,
  ChannelSpec,
  Dashboard,
  DashboardSubscription,
  Pulse,
  ScheduleSettings,
  User,
} from "metabase-types/api";

import { CaveatMessage } from "./CaveatMessage";
import DefaultParametersSection from "./DefaultParametersSection";
import DeleteSubscriptionAction from "./DeleteSubscriptionAction";
import Heading from "./Heading";
import { CHANNEL_NOUN_PLURAL } from "./constants";

interface AddEditEmailSidebarProps {
  pulse: DashboardSubscription;
  formInput: ChannelApiResponse;
  channel: Channel;
  channelSpec: ChannelSpec;
  users: User[];
  parameters: UiParameter[];
  hiddenParameters?: string;
  dashboard: Dashboard;
  handleSave: () => void;
  onCancel: () => void;
  onChannelPropertyChange: (property: string, value: unknown) => void;
  onChannelScheduleChange: (
    schedule: ScheduleSettings,
    changedProp: ScheduleChangeProp,
  ) => void;
  testPulse: () => void;
  toggleSkipIfEmpty: () => void;
  setPulse: (pulse: Pulse) => void;
  handleArchive: () => void;
  setPulseParameters: (parameters: UiParameter[]) => void;
}

export const AddEditEmailSidebar = ({
  pulse,
  formInput,
  channel,
  channelSpec,
  users,
  parameters,
  hiddenParameters,
  dashboard,

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

  return (
    <Sidebar
      isCloseDisabled={!isValid}
      onClose={handleSave}
      onCancel={onCancel}
    >
      <div className={cx(CS.pt3, CS.px4, CS.flex, CS.alignCenter)}>
        <Icon name="mail" className={CS.mr1} size={21} />
        <Heading>{t`Email this dashboard`}</Heading>
      </div>
      <CaveatMessage />
      <div
        className={cx(CS.my2, CS.px4, CS.fullHeight, CS.flex, CS.flexColumn)}
      >
        <div>
          <div className={cx(CS.textBold, CS.mb1)}>{t`To:`}</div>
          <RecipientPicker
            autoFocus={false}
            recipients={channel.recipients}
            users={users}
            onRecipientsChange={recipients =>
              onChannelPropertyChange("recipients", recipients)
            }
            invalidRecipientText={domains =>
              t`You're only allowed to email subscriptions to addresses ending in ${domains}`
            }
          />
        </div>
        <SchedulePicker
          schedule={_.pick(
            channel,
            "schedule_day",
            "schedule_frame",
            "schedule_hour",
            "schedule_type",
          )}
          scheduleOptions={channelSpec.schedules}
          textBeforeInterval={t`Sent`}
          textBeforeSendTime={t`${
            (channelSpec?.type && CHANNEL_NOUN_PLURAL[channelSpec.type]) ??
            t`Messages`
          } will be sent at`}
          onScheduleChange={(newSchedule, changedProp) =>
            onChannelScheduleChange(newSchedule, changedProp)
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
          <Heading>{t`Don't send if there aren't results`}</Heading>
          <Toggle
            value={pulse.skip_if_empty || false}
            onChange={toggleSkipIfEmpty}
          />
        </div>
        <EmailAttachmentPicker
          cards={pulse.cards}
          pulse={pulse}
          setPulse={setPulse}
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
