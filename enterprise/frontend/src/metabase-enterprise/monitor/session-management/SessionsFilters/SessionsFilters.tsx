import { useState } from "react";
import { t } from "ttag";

import {
  FilterPill,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import type { AdminSessionProvider } from "metabase-types/api";

import { PROVIDER_VALUES } from "../SessionsPage/constants";
import type { SessionsUrlState } from "../SessionsPage/types";
import { getProviderLabel } from "../utils";

type SessionsFiltersProps = {
  state: SessionsUrlState;
  onChange: (patch: Partial<SessionsUrlState>) => void;
};

export const hasActiveFilters = (state: SessionsUrlState): boolean =>
  state.provider.length > 0;

export const SessionsFilters = ({ state, onChange }: SessionsFiltersProps) => {
  const [draft, setDraft] = useState<AdminSessionProvider[]>(state.provider);

  const toggleProvider = (provider: AdminSessionProvider) => {
    setDraft((prev) =>
      prev.includes(provider)
        ? prev.filter((value) => value !== provider)
        : [...prev, provider],
    );
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters(state)}
      onOpen={() => setDraft(state.provider)}
      onApply={() => onChange({ provider: draft, page: 0 })}
      onClear={() => onChange({ provider: [], page: 0 })}
    >
      <FilterSection label={t`Auth method`}>
        {PROVIDER_VALUES.map((provider) => (
          <FilterPill
            key={provider}
            label={getProviderLabel(provider)}
            selected={draft.includes(provider)}
            onClick={() => toggleProvider(provider)}
          />
        ))}
      </FilterSection>
    </ListFilterPopover>
  );
};
