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
  type MonitorTimePreset,
  getTimePresetOptions,
  toTimePreset,
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
  lastUsed: MonitorTimePreset | null;
};

const stateToDraft = (
  state: OAuthClientsUrlState,
  selectedUser: UserOption | null,
): FilterDraft => ({
  registered: state.registered,
  user: selectedUser,
  lastUsed: state.last_used,
});

const EMPTY_DRAFT: FilterDraft = {
  registered: null,
  user: null,
  lastUsed: null,
};

/** The URL-state patch a draft asks for: the picker carries a whole user, the URL carries its id. */
const draftToPatch = (draft: FilterDraft): Partial<OAuthClientsUrlState> => ({
  registered: draft.registered,
  user: draft.user?.id ?? null,
  last_used: draft.lastUsed,
  page: 0,
});

// Only the filters the current tab shows count towards the indicator dot
const hasActiveFilters = (state: OAuthClientsUrlState): boolean =>
  state.registered !== null ||
  (state.tab !== "revoked" &&
    (state.user !== null || state.last_used !== null));

export const OAuthClientsFilters = ({
  state,
  selectedUser,
  onChange,
}: OAuthClientsFiltersProps) => {
  const [draft, setDraft] = useState<FilterDraft>(() =>
    stateToDraft(state, selectedUser),
  );
  // `user-id` matches an unrevoked token and revoking a client stamps every token it held, so the filter could only
  // ever come back empty on the Revoked tab; `last_used` likewise, since a revoked client's tokens stop resolving
  // and nothing can move its last use after that. `registered` is offered on both: a revoked client was registered too.
  const isRevokedTab = state.tab === "revoked";

  const handleRegisteredChange = (value: string | null) => {
    setDraft((prev) => ({ ...prev, registered: toTimePreset(value) }));
  };

  const handleUserChange = (user: UserOption | null) => {
    setDraft((prev) => ({ ...prev, user }));
  };

  const handleLastUsedChange = (value: string | null) => {
    setDraft((prev) => ({ ...prev, lastUsed: toTimePreset(value) }));
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
          data={getTimePresetOptions()}
          value={draft.registered}
          aria-label={t`Registered`}
          placeholder={t`Any time`}
          clearable
          comboboxProps={FILTER_POPOVER_COMBOBOX}
          onChange={handleRegisteredChange}
        />
      </FilterSection>

      {!isRevokedTab && (
        <>
          <FilterSection label={t`Last used`}>
            <Select
              w="100%"
              data={getTimePresetOptions()}
              value={draft.lastUsed}
              aria-label={t`Last used`}
              // not plain "Any time", which is what the Registered filter above offers: here the unfiltered state
              // also takes in the clients that have never been used at all
              placeholder={t`Any time, used or not`}
              clearable
              comboboxProps={FILTER_POPOVER_COMBOBOX}
              onChange={handleLastUsedChange}
            />
          </FilterSection>

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
        </>
      )}
    </ListFilterPopover>
  );
};
