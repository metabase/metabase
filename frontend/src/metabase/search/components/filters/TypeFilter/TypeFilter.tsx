import { t } from "ttag";

import type {
  SearchFilterComponent,
  TypeFilterProps,
} from "metabase/search/types";
import {
  filterEnabledSearchTypes,
  isEnabledSearchModelType,
} from "metabase/search/utils/enabled-search-type";

import { TypeFilterContent } from "./TypeFilterContent";
import { TypeFilterDisplay } from "./TypeFilterDisplay";

export const TypeFilter: SearchFilterComponent<"type"> = {
  iconName: "dashboard",
  label: () => t`Content type`,
  type: "dropdown",
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
  fromUrl: value => {
    if (Array.isArray(value)) {
      return filterEnabledSearchTypes(value);
    }
    return isEnabledSearchModelType(value) ? [value] : [];
  },
  toUrl: (value: TypeFilterProps | null) => {
    return value && value.length > 0 ? value : null;
  },
};
