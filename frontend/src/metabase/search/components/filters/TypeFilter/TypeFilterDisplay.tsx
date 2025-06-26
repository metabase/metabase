/* eslint-disable react/prop-types */
import { t } from "ttag";

import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import type {
  SearchFilterComponent,
  SearchFilterDropdown,
  TypeFilterProps,
} from "metabase/search/types";
import {
  filterEnabledSearchTypes,
  isEnabledSearchModelType,
} from "metabase/search/utils/enabled-search-type";
import { Text } from "metabase/ui";

import { TypeFilterContent } from "./TypeFilterContent";

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
      <Text c="inherit" fw={700} truncate>
        {titleText}
      </Text>
    );
  };

export const TypeFilter: SearchFilterComponent<"type"> = {
  iconName: "dashboard",
  label: () => t`Content type`,
  type: "dropdown",
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
  fromUrl: (value) => {
    if (Array.isArray(value)) {
      return filterEnabledSearchTypes(value);
    }
    return isEnabledSearchModelType(value) ? [value] : [];
  },
  toUrl: (value: TypeFilterProps | null) => {
    return value && value.length > 0 ? value : null;
  },
};
