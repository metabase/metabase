import { t } from "ttag";

import { Box, Flex, TextInput } from "metabase/ui";

export function OmniPickerSearch({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (query: string) => void }) {
  return (
    <TextInput
      data-testid="omni-picker-search-input"
      type="search"
      placeholder={t`Search...`}
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      w="100%"
    />
  )
}
