import { useMemo } from "react";
import { t } from "ttag";

import { useListApiKeysQuery } from "metabase/admin/settings/api/api-key";
import { Select } from "metabase/ui";

// Matches the width of the shared ConversationFilters selects it sits alongside.
const FILTER_WIDTH = 205;

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
};

/**
 * The API key an admin is scoping the page to — the primary dimension of this view (see EMB-2391
 * discussion), kept separate from the shared `ConversationFilters` bar since that component is also
 * used by pages with no notion of an API key.
 */
export function ApiKeyFilterSelect({ value, onChange }: Props) {
  const { data: apiKeys } = useListApiKeysQuery();

  const options = useMemo(
    () =>
      (apiKeys ?? []).map((apiKey) => ({
        value: String(apiKey.id),
        label: apiKey.name,
      })),
    [apiKeys],
  );

  return (
    <Select
      data={[{ value: "", label: t`All API keys` }, ...options]}
      value={value ?? ""}
      onChange={(val) => onChange(val === "" ? null : val)}
      searchable
      w={FILTER_WIDTH}
      bdrs="xs"
      data-testid="api-key-usage-filter-select"
    />
  );
}
