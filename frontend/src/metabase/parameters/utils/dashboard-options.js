import { t } from "ttag";

import { ID_OPTION } from "metabase-lib/v1/parameters/constants";
import { buildTypedOperatorOptions } from "metabase-lib/v1/parameters/utils/operators";

export function getDashboardParameterSections() {
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
  ].filter(Boolean);
}

export function getDefaultOptionForParameterSection() {
  const sections = getDashboardParameterSections();

  const map = Object.fromEntries(
    sections.map(section => {
      const { id: sectionId, options } = section;
      let defaultOption;

      if (sectionId === "id") {
        defaultOption = options[0];
      }

      if (sectionId === "location") {
        defaultOption = options.find(o => o.type === "string/=");
      }

      if (sectionId === "number") {
        defaultOption = options.find(o => o.type === "number/between");
      }

      if (sectionId === "string") {
        defaultOption = options.find(o => o.type === "string/=");
      }

      if (sectionId === "date") {
        defaultOption = options.find(o => o.type === "date/all-options");
      }

      return [sectionId, defaultOption];
    }),
  );

  return map;
}
