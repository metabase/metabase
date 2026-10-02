import { useState } from "react";
import { t } from "ttag";

import {
  FILTER_POPOVER_COMBOBOX,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import {
  type UserOption,
  UserPicker,
} from "metabase/common/components/UserPicker";
import {
  MONITOR_TIME_PRESETS,
  type MonitorTimePreset,
  getTimePresetLabel,
  isTimePreset,
} from "metabase/monitor/time-presets";
import { Select } from "metabase/ui";

import type { OAuthClientsUrlState } from "../OAuthClientsPage/types";

type OAuthClientsFiltersProps = {
  state: OAuthClientsUrlState;
  /** The user named by `state.user`, so the picker can show a name rather than an id. */
  selectedUser: UserOption | null;
  onChange: (patch: Partial<OAuthClientsUrlState>) => void;
};

type FilterDraft = {
  registered: MonitorTimePreset | null;
  user: UserOption | null;
};

const stateToDraft = (
  state: OAuthClientsUrlState,
  selectedUser: UserOption | null,
): FilterDraft => ({ registered: state.registered, user: selectedUser });

const EMPTY_DRAFT: FilterDraft = { registered: null, user: null };

/** The URL-state patch a draft asks for: the picker carries a whole user, the URL carries its id. */
const draftToPatch = (draft: FilterDraft): Partial<OAuthClientsUrlState> => ({
  registered: draft.registered,
  user: draft.user?.id ?? null,
  page: 0,
});

// Only the filters the current tab shows count towards the indicator dot
const hasActiveFilters = (state: OAuthClientsUrlState): boolean =>
  state.registered !== null || (state.tab !== "revoked" && state.user !== null);

export const OAuthClientsFilters = ({
  state,
  selectedUser,
  onChange,
}: OAuthClientsFiltersProps) => {
  const [draft, setDraft] = useState<FilterDraft>(() =>
    stateToDraft(state, selectedUser),
  );
  // `user-id` matches an unrevoked token and revoking a client stamps every token it held, so the filter could only
  // ever come back empty on the Revoked tab. `registered` is offered on both: a revoked client was registered too.
  const isRevokedTab = state.tab === "revoked";

  const handleRegisteredChange = (value: string | null) => {
    setDraft((prev) => ({
      ...prev,
      registered: value !== null && isTimePreset(value) ? value : null,
    }));
  };

  const handleUserChange = (user: UserOption | null) => {
    setDraft((prev) => ({ ...prev, user }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      onOpen={() => setDraft(stateToDraft(state, selectedUser))}
      onApply={() => onChange(draftToPatch(draft))}
      onClear={() => onChange(draftToPatch(EMPTY_DRAFT))}
    >
      <FilterSection label={t`Registered`}>
        <Select
          w="100%"
          data={MONITOR_TIME_PRESETS.map((preset) => ({
            value: preset,
            label: getTimePresetLabel(preset),
          }))}
          value={draft.registered}
          placeholder={t`Any time`}
          clearable
          comboboxProps={FILTER_POPOVER_COMBOBOX}
          onChange={handleRegisteredChange}
        />
      </FilterSection>

      {!isRevokedTab && (
        <FilterSection label={t`User`}>
          <UserPicker
            flex="1"
            value={draft.user}
            placeholder={t`Any user`}
            clearable
            comboboxProps={FILTER_POPOVER_COMBOBOX}
            onChange={handleUserChange}
          />
        </FilterSection>
      )}
    </ListFilterPopover>
  );
};
