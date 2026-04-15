import { useCallback } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import {
  MultiAutocomplete as MultiAutocompleteBase,
  type MultiAutocompleteProps,
} from "metabase/ui";

export function MultiAutocompleteWithTranslation(
  props: MultiAutocompleteProps,
) {
  const tc = useTranslateContent();
  const sortByTranslation =
    PLUGIN_CONTENT_TRANSLATION.useSortByContentTranslation();

  const sortComparator = useCallback(
    (a: string, b: string) => sortByTranslation(tc(a), tc(b)),
    [tc, sortByTranslation],
  );

  return <MultiAutocompleteBase {...props} sortComparator={sortComparator} />;
}
