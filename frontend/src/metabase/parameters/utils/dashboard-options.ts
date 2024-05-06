import { t } from "ttag";

import { ID_OPTION } from "metabase-lib/v1/parameters/constants";
import { buildTypedOperatorOptions } from "metabase-lib/v1/parameters/utils/operators";
import type { ParameterMappingOptions } from "metabase-types/api";

export type SectionId = "date" | "location" | "id" | "number" | "string";

export interface ParameterSection {
  id: SectionId;
  name: string;
  description: string;
  options: ParameterMappingOptions[];
}

export function getDashboardParameterSections(): ParameterSection[] {
  return [
    {
      id: "date" as const,
      name: t`Time`,
      description: t`Date range, relative date, time of day, etc.`,
      options: buildTypedOperatorOptions("date", "date", t`Date`),
    },
    {
      id: "location" as const,
      name: t`Location`,
      description: t`City, State, Country, ZIP code.`,
      options: buildTypedOperatorOptions("string", "location", t`Location`),
    },
    {
      id: "id" as const,
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
      id: "number" as const,
      name: t`Number`,
      description: t`Subtotal, Age, Price, Quantity, etc.`,
      options: buildTypedOperatorOptions("number", "number", t`Number`),
    },
    {
      id: "string" as const,
      name: t`Text or Category`,
      description: t`Name, Rating, Description, etc.`,
      options: buildTypedOperatorOptions("string", "string", t`Text`),
    },
  ].filter(Boolean);
}

export function getDefaultOptionForParameterSection(): Record<
  SectionId,
  ParameterMappingOptions
> {
  const sections = getDashboardParameterSections();

  const map = Object.fromEntries(
    sections.map(section => {
      const { id: sectionId, options } = section;
      let defaultOption: ParameterMappingOptions | undefined;

      if (sectionId === "id") {
        defaultOption = options[0];
      }

      if (sectionId === "location") {
        defaultOption = options.find(o => o.type === "string/=");
      }

      if (sectionId === "number") {
        defaultOption = options.find(o => o.type === "number/=");
      }

      if (sectionId === "string") {
        defaultOption = options.find(o => o.type === "string/=");
      }

      if (sectionId === "date") {
        defaultOption = options.find(o => o.type === "date/all-options");
      }

      if (!defaultOption) {
        throw new Error(
          "No default option found for parameter section: " + sectionId,
        );
      }

      return [sectionId, defaultOption];
    }),
  );

  return map as Record<SectionId, ParameterMappingOptions>;
}
