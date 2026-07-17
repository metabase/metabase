import cx from "classnames";
import { useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Schedule, toCronString } from "metabase/common/components/Schedule";
import type { ScheduleChangeProp } from "metabase/common/components/Schedule/types";
import { SendTestPulse } from "metabase/common/components/SendTestPulse";
import { Sidebar } from "metabase/common/components/Sidebar";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { RecipientPicker } from "metabase/notifications/channels/RecipientPicker";
import { formatNotificationScheduleDescription } from "metabase/notifications/utils";
import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { dashboardPulseIsValid } from "metabase/pulse";
import { useSelector } from "metabase/redux";
import type { DraftDashboardSubscription } from "metabase/redux/store";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import { Icon, Stack, Switch, Text, Title } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  type Channel,
  type ChannelApiResponse,
  type ChannelSpec,
  type Dashboard,
  DataPermissionValue,
  type ScheduleSettings,
  type User,
} from "metabase-types/api";

import S from "./AddEditSidebar.module.css";
import { CaveatMessage } from "./CaveatMessage";
import DefaultParametersSection from "./DefaultParametersSection";
import { DeleteSubscriptionAction } from "./DeleteSubscriptionAction";
import { EmailAttachmentPicker } from "./EmailAttachmentPicker";
import { SubscriptionScheduleDescription } from "./SubscriptionScheduleDescription";

interface AddEditEmailSidebarProps {
  pulse: DraftDashboardSubscription;
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
  const userCanAccessSettings = useSelector(canAccessSettings);
  const currentUser = useSelector(getUser);

  const renderScheduleDescription = (schedule: ScheduleSettings) => {
    const description = formatNotificationScheduleDescription(schedule);
    return description ? (
      <SubscriptionScheduleDescription
        channelSpec={channelSpec}
        description={description}
      />
    ) : null;
  };

  // Return true if the results of all cards can be downloaded
  const allowDownload = pulse.cards.every(
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
          <div>
            <div className={CS.mb1}>{t`To:`}</div>
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
          mt="md"
          cronString={toCronString(
            _.pick(
              channel,
              "schedule_day",
              "schedule_frame",
              "schedule_hour",
              "schedule_type",
            ),
          )}
          scheduleOptions={channelSpec.schedules}
          verb={t`Sent`}
          renderScheduleDescription={renderScheduleDescription}
          onScheduleChange={(_cronString, newSchedule) =>
            onChannelScheduleChange(newSchedule, {
              name: "schedule_type",
              value: newSchedule.schedule_type,
            })
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
          <EmailAttachmentPicker
            cards={pulse.cards}
            pulse={pulse}
            setPulse={setPulse}
            allowDownload={allowDownload}
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
