import { useState } from "react";
import { t } from "ttag";

import {
  FilterPill,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import { Select } from "metabase/ui";
import type { AdminSessionProvider } from "metabase-types/api";

import { LAST_ACTIVE_VALUES, PROVIDER_VALUES } from "../SessionsPage/constants";
import type {
  SessionsLastActive,
  SessionsUrlState,
} from "../SessionsPage/types";
import { isLastActive } from "../SessionsPage/utils";
import { getLastActiveLabel, getProviderLabel } from "../utils";

type SessionsFiltersProps = {
  state: SessionsUrlState;
  onChange: (patch: Partial<SessionsUrlState>) => void;
};

type FilterDraft = {
  provider: AdminSessionProvider[];
  last_active: SessionsLastActive | null;
};

const stateToDraft = (state: SessionsUrlState): FilterDraft => ({
  provider: state.provider,
  last_active: state.last_active,
});

export const hasActiveFilters = (state: SessionsUrlState): boolean =>
  state.provider.length > 0 || state.last_active !== null;

export const SessionsFilters = ({ state, onChange }: SessionsFiltersProps) => {
  const [draft, setDraft] = useState<FilterDraft>(() => stateToDraft(state));

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
      last_active: value !== null && isLastActive(value) ? value : null,
    }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      onOpen={() => setDraft(stateToDraft(state))}
      onApply={() => onChange({ ...draft, page: 0 })}
      onClear={() => onChange({ provider: [], last_active: null, page: 0 })}
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

      <FilterSection label={t`Last active`}>
        <Select
          w="100%"
          data={LAST_ACTIVE_VALUES.map((preset) => ({
            value: preset,
            label: getLastActiveLabel(preset),
          }))}
          value={draft.last_active}
          placeholder={t`Any time`}
          clearable
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
            position: "bottom-start",
          }}
          onChange={handleLastActiveChange}
        />
      </FilterSection>
    </ListFilterPopover>
  );
};
