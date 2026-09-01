import { useState } from "react";
import { t } from "ttag";

import {
  FilterPill,
  FilterSection,
  ListFilterPopover,
} from "metabase/common/components/ListFilterPopover";
import { useGetIcon } from "metabase/hooks/use-icon";

export type CachingPolicyFilter = "default" | "custom";
export type CachingTypeFilter = "dashboard" | "question";

export type CachingFilters = {
  policy: CachingPolicyFilter | null;
  type: CachingTypeFilter | null;
};

export const EMPTY_CACHING_FILTERS: CachingFilters = {
  policy: null,
  type: null,
};

type Props = {
  filters: CachingFilters;
  onChange: (filters: CachingFilters) => void;
};

export const CachingPoliciesFilters = ({ filters, onChange }: Props) => {
  const getIcon = useGetIcon();
  const [draft, setDraft] = useState<CachingFilters>(filters);
  const hasActiveFilters = filters.policy !== null || filters.type !== null;

  const togglePolicy = (policy: CachingPolicyFilter) => {
    setDraft((prev) => ({
      ...prev,
      policy: prev.policy === policy ? null : policy,
    }));
  };

  const toggleType = (type: CachingTypeFilter) => {
    setDraft((prev) => ({
      ...prev,
      type: prev.type === type ? null : type,
    }));
  };

  return (
    <ListFilterPopover
      hasActiveFilters={hasActiveFilters}
      onOpen={() => setDraft(filters)}
      onApply={() => onChange(draft)}
      onClear={() => onChange(EMPTY_CACHING_FILTERS)}
    >
      <FilterSection label={t`Caching policy`}>
        <FilterPill
          label={t`Default`}
          selected={draft.policy === "default"}
          onClick={() => togglePolicy("default")}
        />
        <FilterPill
          label={t`Custom`}
          selected={draft.policy === "custom"}
          onClick={() => togglePolicy("custom")}
        />
      </FilterSection>

      <FilterSection label={t`Type`}>
        <FilterPill
          icon={getIcon({ model: "dashboard" }).name}
          label={t`Dashboard`}
          selected={draft.type === "dashboard"}
          onClick={() => toggleType("dashboard")}
        />
        <FilterPill
          icon={getIcon({ model: "card" }).name}
          label={t`Question`}
          selected={draft.type === "question"}
          onClick={() => toggleType("question")}
        />
      </FilterSection>
    </ListFilterPopover>
  );
};
