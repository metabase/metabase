import { useMemo } from "react";
import { t } from "ttag";

import { Button, Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFormulaSuggestions } from "../../utils/formula-suggestions";
import { compileTableFormula } from "../../utils/table-formula";

/**
 * One-click calculations for the current table, so adding something doesn't
 * require knowing the formula syntax or what columns exist.
 */
export function FormulaSuggestions({
  query,
  onChange,
}: {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}) {
  const suggestions = useMemo(() => getFormulaSuggestions(query), [query]);

  if (suggestions.length === 0) {
    return null;
  }

  const handlePick = (source: string) => {
    const { clause } = compileTableFormula(query, source);
    if (clause) {
      onChange(Lib.aggregate(query, -1, clause));
    }
  };

  return (
    <Flex
      align="center"
      gap="sm"
      wrap="wrap"
      aria-label={t`Suggested calculations`}
      role="group"
    >
      <Text size="sm" c="text-secondary">{t`Try`}</Text>
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.source}
          size="compact-sm"
          variant="default"
          radius="xl"
          leftSection={
            <Icon
              name={suggestion.kind === "metric" ? "metric" : "add"}
              size={12}
              aria-hidden
            />
          }
          onClick={() => handlePick(suggestion.source)}
        >
          {suggestion.label}
        </Button>
      ))}
    </Flex>
  );
}
