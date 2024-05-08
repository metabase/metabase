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
      name: t`Time`,
      description: t`Date range, relative date, time of day, etc.`,
      options: buildTypedOperatorOptions("date", "date", t`Date`),
    },
    {
      id: "location",
      name: t`Location`,
      description: t`City, State, Country, ZIP code.`,
      options: buildTypedOperatorOptions("string", "location", t`Location`),
    },
    {
      id: "id",
      name: t`ID`,
      description: t`User ID, Product ID, Event ID, etc.`,
      options: [
        {
          ...ID_OPTION,
          sectionId: "id",
        },
      ],
    },
    {
      id: "number",
      name: t`Number`,
      description: t`Subtotal, Age, Price, Quantity, etc.`,
      options: buildTypedOperatorOptions("number", "number", t`Number`),
    },
    {
      id: "string",
      name: t`Text or Category`,
      description: t`Name, Rating, Description, etc.`,
      options: buildTypedOperatorOptions("string", "string", t`Text`),
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

    if (sectionId === "id") {
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
