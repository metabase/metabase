import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import {
  type ScheduleChangeProp,
  SchedulePicker,
} from "metabase/common/components/SchedulePicker";
import { SendTestPulse } from "metabase/common/components/SendTestPulse";
import { Sidebar } from "metabase/common/components/Sidebar";
import CS from "metabase/css/core/index.css";
import { SlackChannelField } from "metabase/notifications/channels/SlackChannelField";
import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { dashboardPulseIsValid } from "metabase/pulse";
import type { DraftDashboardSubscription } from "metabase/redux/store";
import { Icon, Stack, Switch, Text, Title } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  type Channel,
  type ChannelApiResponse,
  type ChannelSpec,
  type ChannelSpecs,
  type Dashboard,
  DataPermissionValue,
  type ScheduleSettings,
} from "metabase-types/api";

import S from "./AddEditSidebar.module.css";
import { CaveatMessage } from "./CaveatMessage";
import DefaultParametersSection from "./DefaultParametersSection";
import { DeleteSubscriptionAction } from "./DeleteSubscriptionAction";
import { CHANNEL_NOUN_PLURAL } from "./constants";

interface AddEditSlackSidebarProps {
  pulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  channel: Channel;
  channelSpec: ChannelSpec;
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

  // Return true if the results of all cards can be downloaded
  const allowDownload = pulse.cards?.every(
    (card) => card.download_perms !== DataPermissionValue.NONE,
  );

  // Whether to share a server-rendered PDF of the whole dashboard to the channel.
  const includePdf = !!allowDownload && !!channel.details?.include_pdf;

  const handleToggleIncludePdf = (checked: boolean) => {
    onChannelPropertyChange("details", {
      ...channel.details,
      include_pdf: checked,
    });
  };

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
        <SchedulePicker
          schedule={_.pick(
            channel,
            "schedule_day",
            "schedule_frame",
            "schedule_hour",
            "schedule_type",
          )}
          scheduleOptions={channelSpec.schedules}
          textBeforeInterval={t`Send`}
          textBeforeSendTime={t`${
            (channelSpec?.type && CHANNEL_NOUN_PLURAL[channelSpec.type]) ??
            t`Messages`
          } will be sent at`}
          onScheduleChange={(newSchedule, changedProp) =>
            onChannelScheduleChange(newSchedule, changedProp)
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
        <Stack gap="md" py="lg" className={CS.borderTop}>
          <Switch
            checked={pulse.skip_if_empty || false}
            onChange={toggleSkipIfEmpty}
            label={
              <Text fw="bold">{t`Don't send if there aren't results`}</Text>
            }
            labelPosition="left"
            classNames={{
              body: S.SwitchBody,
            }}
          />

          <Switch
            aria-label={t`Send dashboard as PDF`}
            checked={includePdf}
            onChange={(e) => handleToggleIncludePdf(e.target.checked)}
            disabled={!allowDownload}
            labelPosition="left"
            classNames={{
              body: S.SwitchBody,
              input: S.SwitchInput,
            }}
            label={<Text fw="bold">{t`Send dashboard as PDF`}</Text>}
          />
        </Stack>
        {pulse.id != null && (
          <DeleteSubscriptionAction
            pulse={pulse}
            handleArchive={handleArchive}
          />
        )}
      </div>
    </Sidebar>
  );
};
