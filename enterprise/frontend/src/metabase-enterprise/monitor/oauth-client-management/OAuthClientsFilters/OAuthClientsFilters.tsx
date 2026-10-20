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
import { TimePresetFilter } from "metabase/monitor/components/TimePresetFilter";
import type { MonitorTimePreset } from "metabase/monitor/time-presets";

import type { OAuthClientsUrlState } from "../OAuthClientsPage/types";

type OAuthClientsFiltersProps = {
  state: OAuthClientsUrlState;
  selectedUser: UserOption | null;
  onChange: (patch: Partial<OAuthClientsUrlState>) => void;
};

type FilterDraft = {
  registered: MonitorTimePreset | null;
  // absent until the picker is touched, so a URL user whose name hasn't loaded yet isn't dropped
  user?: UserOption | null;
  lastUsed: MonitorTimePreset | null;
};

const stateToDraft = (state: OAuthClientsUrlState): FilterDraft => ({
  registered: state.registered,
  lastUsed: state.last_used,
});

const EMPTY_DRAFT: FilterDraft = {
  registered: null,
  user: null,
  lastUsed: null,
};

const draftToPatch = (
  draft: FilterDraft,
  state: OAuthClientsUrlState,
): Partial<OAuthClientsUrlState> => ({
  registered: draft.registered,
  user: draft.user === undefined ? state.user : (draft.user?.id ?? null),
  last_used: draft.lastUsed,
  page: 0,
});

// Only the filters the current tab shows count towards the indicator dot
export const hasActiveFilters = (state: OAuthClientsUrlState): boolean =>
  state.registered !== null ||
  (state.tab !== "revoked" &&
    (state.user !== null || state.last_used !== null));

export const OAuthClientsFilters = ({
  state,
  selectedUser,
  onChange,
}: OAuthClientsFiltersProps) => {
  const [draft, setDraft] = useState<FilterDraft>(() => stateToDraft(state));
  const isRevokedTab = state.tab === "revoked";

  const handleRegisteredChange = (registered: MonitorTimePreset | null) => {
    setDraft((prev) => ({ ...prev, registered }));
  };

  const handleUserChange = (user: UserOption | null) => {
    setDraft((prev) => ({ ...prev, user }));
  };

  const handleLastUsedChange = (lastUsed: MonitorTimePreset | null) => {
    setDraft((prev) => ({ ...prev, lastUsed }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      buttonProps={{ size: "lg" }}
      onOpen={() => setDraft(stateToDraft(state))}
      onApply={() => onChange(draftToPatch(draft, state))}
      onClear={() => onChange(draftToPatch(EMPTY_DRAFT, state))}
    >
      <TimePresetFilter
        label={t`Registered`}
        value={draft.registered}
        onChange={handleRegisteredChange}
      />

      {!isRevokedTab && (
        <>
          <TimePresetFilter
            label={t`Last used`}
            value={draft.lastUsed}
            placeholder={t`Any time, used or not`}
            onChange={handleLastUsedChange}
          />

          <FilterSection label={t`User`}>
            <UserPicker
              flex="1"
              value={draft.user === undefined ? selectedUser : draft.user}
              aria-label={t`User`}
              placeholder={t`Any user`}
              clearable
              comboboxProps={FILTER_POPOVER_COMBOBOX}
              onChange={handleUserChange}
            />
          </FilterSection>
        </>
      )}
    </ListFilterPopover>
  );
};
