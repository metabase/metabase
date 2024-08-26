import { t } from "ttag";

import { ID_OPTION } from "metabase-lib/v1/parameters/constants";
import type { ParameterSectionId } from "metabase-lib/v1/parameters/utils/operators";
import { buildTypedOperatorOptions } from "metabase-lib/v1/parameters/utils/operators";
import type { ParameterMappingOptions } from "metabase-types/api";

export interface ParameterSection {
  id: ParameterSectionId;
  name: string;
  description: string;
  options: ParameterMappingOptions[];
}

export function getDashboardParameterSections(): ParameterSection[] {
  return [
    {
      id: "date",
      name: t`Date picker`,
      description: t`Date range, specific date…`,
      options: buildTypedOperatorOptions("date", "date", t`Date`),
    },
    {
      id: "temporal-unit",
      name: t`Time grouping`,
      description: t`Day, week, month, year…`,
      options: [
        {
          name: t`Time grouping`,
          type: "temporal-unit",
          sectionId: "temporal-unit",
        },
      ],
    },
    {
      id: "location",
      name: t`Location`,
      description: t`Country, State, Postal Code…`,
      options: buildTypedOperatorOptions("string", "location", t`Location`),
    },
    {
      id: "string",
      name: t`Text or Category`,
      description: t`Contains, is, starts with…`,
      options: buildTypedOperatorOptions("string", "string", t`Text`),
    },
    {
      id: "number",
      name: t`Number`,
      description: t`Between, greater than…`,
      options: buildTypedOperatorOptions("number", "number", t`Number`),
    },
    {
      id: "id",
      name: t`ID`,
      description: t`Primary key, User ID…`,
      options: [
        {
          ...ID_OPTION,
          sectionId: "id",
        },
      ],
    },
  ];
}

const defaultSectionToParameter = {
  location: "string/=",
  number: "number/=",
  string: "string/=",
  date: "date/all-options",
};

export function getDefaultOptionForParameterSectionMap(): Record<
  ParameterSectionId,
  ParameterMappingOptions
> {
  const sections = getDashboardParameterSections();
  const map = {} as Record<ParameterSectionId, ParameterMappingOptions>;

  for (const section of sections) {
    const { id: sectionId, options } = section;

    if (sectionId === "id" || sectionId === "temporal-unit") {
      map[sectionId] = options[0];
      continue;
    }

    const defaultOperator = defaultSectionToParameter[sectionId];
    const defaultOption = options.find(
      option => option.type === defaultOperator,
    );

    if (!defaultOption) {
      throw new Error(
        `No default option found for parameter section "${sectionId}"`,
      );
    }

    map[sectionId] = defaultOption;
  }

  return map;
}
