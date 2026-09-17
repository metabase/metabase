import { useState } from "react";
import { t } from "ttag";

import {
  FilterPill,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import { Select } from "metabase/ui";
import type {
  AdminSessionEndReason,
  AdminSessionProvider,
} from "metabase-types/api";

import {
  END_REASON_VALUES,
  PROVIDER_VALUES,
  TIME_PRESET_VALUES,
} from "../SessionsPage/constants";
import type {
  SessionsTimePreset,
  SessionsUrlState,
} from "../SessionsPage/types";
import { isEndReason, isTimePreset } from "../SessionsPage/utils";
import {
  getEndReasonLabel,
  getProviderLabel,
  getTimePresetLabel,
} from "../utils";

type SessionsFiltersProps = {
  state: SessionsUrlState;
  onChange: (patch: Partial<SessionsUrlState>) => void;
};

type FilterDraft = {
  provider: AdminSessionProvider[];
  last_active: SessionsTimePreset | null;
  ended: SessionsTimePreset | null;
  reason: AdminSessionEndReason | null;
};

const stateToDraft = (state: SessionsUrlState): FilterDraft => ({
  provider: state.provider,
  last_active: state.last_active,
  ended: state.ended,
  reason: state.reason,
});

const EMPTY_FILTERS: FilterDraft = {
  provider: [],
  last_active: null,
  ended: null,
  reason: null,
};

// Only the filters the current tab shows count towards the indicator dot
export const hasActiveFilters = (state: SessionsUrlState): boolean =>
  state.provider.length > 0 ||
  (state.tab === "ended"
    ? state.ended !== null || state.reason !== null
    : state.last_active !== null);

const TIME_PRESET_COMBOBOX = {
  withinPortal: false,
  floatingStrategy: "fixed" as const,
  position: "bottom-start" as const,
};

export const SessionsFilters = ({ state, onChange }: SessionsFiltersProps) => {
  const [draft, setDraft] = useState<FilterDraft>(() => stateToDraft(state));
  const isEndedTab = state.tab === "ended";

  const toggleProvider = (provider: AdminSessionProvider) => {
    setDraft((prev) => ({
      ...prev,
      provider: prev.provider.includes(provider)
        ? prev.provider.filter((value) => value !== provider)
        : [...prev.provider, provider],
    }));
  };

  const handleLastActiveChange = (value: string | null) => {
    setDraft((prev) => ({
      ...prev,
      last_active: value !== null && isTimePreset(value) ? value : null,
    }));
  };

  const handleEndedChange = (value: string | null) => {
    setDraft((prev) => ({
      ...prev,
      ended: value !== null && isTimePreset(value) ? value : null,
    }));
  };

  const handleReasonChange = (value: string | null) => {
    setDraft((prev) => ({
      ...prev,
      reason: value !== null && isEndReason(value) ? value : null,
    }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      onOpen={() => setDraft(stateToDraft(state))}
      onApply={() => onChange({ ...draft, page: 0 })}
      onClear={() => onChange({ ...EMPTY_FILTERS, page: 0 })}
    >
      <FilterSection label={t`Auth method`}>
        {PROVIDER_VALUES.map((provider) => (
          <FilterPill
            key={provider}
            label={getProviderLabel(provider)}
            selected={draft.provider.includes(provider)}
            onClick={() => toggleProvider(provider)}
          />
        ))}
      </FilterSection>

      {!isEndedTab && (
        <FilterSection label={t`Last active`}>
          <Select
            w="100%"
            data={TIME_PRESET_VALUES.map((preset) => ({
              value: preset,
              label: getTimePresetLabel(preset),
            }))}
            value={draft.last_active}
            placeholder={t`Any time`}
            clearable
            comboboxProps={TIME_PRESET_COMBOBOX}
            onChange={handleLastActiveChange}
          />
        </FilterSection>
      )}

      {isEndedTab && (
        <FilterSection label={t`Ended`}>
          <Select
            w="100%"
            data={TIME_PRESET_VALUES.map((preset) => ({
              value: preset,
              label: getTimePresetLabel(preset),
            }))}
            value={draft.ended}
            placeholder={t`Any time`}
            clearable
            comboboxProps={TIME_PRESET_COMBOBOX}
            onChange={handleEndedChange}
          />
        </FilterSection>
      )}

      {isEndedTab && (
        <FilterSection label={t`Reason`}>
          <Select
            w="100%"
            data={END_REASON_VALUES.map((reason) => ({
              value: reason,
              label: getEndReasonLabel(reason),
            }))}
            value={draft.reason}
            placeholder={t`Any reason`}
            clearable
            comboboxProps={TIME_PRESET_COMBOBOX}
            onChange={handleReasonChange}
          />
        </FilterSection>
      )}
    </ListFilterPopover>
  );
};
