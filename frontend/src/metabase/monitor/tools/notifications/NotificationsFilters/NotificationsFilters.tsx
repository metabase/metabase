import { useState } from "react";
import { t } from "ttag";

import {
  FilterPill,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import { TextInput } from "metabase/ui";
import type {
  NotificationChannelType,
  NotificationRunStatus,
} from "metabase-types/api";

import { CHANNEL_VALUES } from "../NotificationsAdminPage/constants";
import type {
  FilterDraft,
  NotificationsUrlState,
} from "../NotificationsAdminPage/types";
import {
  getChannelIconName,
  getChannelLabel,
} from "../NotificationsAdminPage/utils";
import { trackAlertsManagementFiltersApplied } from "../analytics";

import { hasActiveFilters, stateToDraft } from "./utils";

type Props = {
  state: NotificationsUrlState;
  onChange: (patch: Partial<NotificationsUrlState>) => void;
};

export const NotificationsFilters = ({ state, onChange }: Props) => {
  const [draft, setDraft] = useState<FilterDraft>(() => stateToDraft(state));
  const isFailingTab = state.tab === "failing";
  const isOwnerlessTab = state.tab === "ownerless";

  const handleApply = () => {
    trackAlertsManagementFiltersApplied();
    onChange({
      channel: draft.channel,
      creator_active: draft.creator_active,
      last_send_status: draft.last_send_status,
      recipient_email: draft.recipient_email.trim(),
      page: 0,
    });
  };

  const handleClear = () => {
    onChange({
      channel: [],
      creator_active: null,
      last_send_status: null,
      recipient_email: "",
      page: 0,
    });
  };

  const toggleChannel = (channel: NotificationChannelType) => {
    setDraft((prev) => ({
      ...prev,
      channel: prev.channel.includes(channel)
        ? prev.channel.filter((c) => c !== channel)
        : [...prev.channel, channel],
    }));
  };

  const toggleCreatorActive = (creatorActive: boolean) => {
    setDraft((prev) => ({
      ...prev,
      creator_active:
        prev.creator_active === creatorActive ? null : creatorActive,
    }));
  };

  const toggleLastSendStatus = (status: NotificationRunStatus) => {
    setDraft((prev) => ({
      ...prev,
      last_send_status: prev.last_send_status === status ? null : status,
    }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      onOpen={() => setDraft(stateToDraft(state))}
      onApply={handleApply}
      onClear={handleClear}
    >
      <FilterSection label={t`Channel`}>
        {CHANNEL_VALUES.map((channel) => (
          <FilterPill
            key={channel}
            icon={getChannelIconName(channel)}
            label={getChannelLabel(channel)}
            selected={draft.channel.includes(channel)}
            onClick={() => toggleChannel(channel)}
          />
        ))}
      </FilterSection>

      {!isFailingTab && (
        <FilterSection label={t`Last send attempt`}>
          <FilterPill
            icon="verified_round"
            label={t`Successful`}
            selected={draft.last_send_status === "successful"}
            onClick={() => toggleLastSendStatus("successful")}
          />
          <FilterPill
            icon="warning_round"
            label={t`Failed`}
            selected={draft.last_send_status === "failing"}
            onClick={() => toggleLastSendStatus("failing")}
          />
        </FilterSection>
      )}

      {!isOwnerlessTab && (
        <FilterSection label={t`Owner`}>
          <FilterPill
            icon="person"
            label={t`Active`}
            selected={draft.creator_active === true}
            onClick={() => toggleCreatorActive(true)}
          />
          <FilterPill
            icon="ghost"
            label={t`Deactivated`}
            selected={draft.creator_active === false}
            onClick={() => toggleCreatorActive(false)}
          />
        </FilterSection>
      )}

      <FilterSection label={t`Email recipient`}>
        <TextInput
          w="100%"
          placeholder={t`recipient@metabase.com`}
          value={draft.recipient_email}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft((prev) => ({
              ...prev,
              recipient_email: value,
            }));
          }}
        />
      </FilterSection>
    </ListFilterPopover>
  );
};
