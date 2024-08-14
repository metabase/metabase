/* eslint-disable react/prop-types */
import { t } from "ttag";

import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { TypeFilter } from "metabase/search/components/filters/TypeFilter";
import type { SearchFilterDropdown } from "metabase/search/types";
import { Text } from "metabase/ui";

export const TypeFilterDisplay: SearchFilterDropdown<"type">["DisplayComponent"] =
  ({ value }) => {
    let titleText = "";
    if (!value || !value.length) {
      titleText = TypeFilter.label();
    } else if (value.length === 1) {
      titleText = getTranslatedEntityName(value[0]) ?? t`1 type selected`;
    } else {
      titleText = value.length + t` types selected`;
    }
    return (
      <Text c="inherit" weight={700} truncate>
        {titleText}
      </Text>
    );
  };
