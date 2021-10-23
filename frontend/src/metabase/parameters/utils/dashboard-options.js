import { t } from "ttag";
import { areFieldFilterOperatorsEnabled } from "./feature-flag";
import { getOperatorDisplayName } from "./operators";
import {
  PARAMETER_OPERATOR_TYPES,
  LOCATION_OPTIONS,
  ID_OPTION,
  CATEGORY_OPTION,
} from "../constants";

export function getDashboardParameterSections() {
  return [
    {
      id: "date",
      name: t`Time`,
      description: t`Date range, relative date, time of day, etc.`,
      options: PARAMETER_OPERATOR_TYPES["date"].map(option => {
        return {
          ...option,
          sectionId: "date",
          combinedName: getOperatorDisplayName(option, "date", t`Date`),
        };
      }),
    },
    {
      id: "location",
      name: t`Location`,
      description: t`City, State, Country, ZIP code.`,
      options: areFieldFilterOperatorsEnabled()
        ? PARAMETER_OPERATOR_TYPES["string"].map(option => {
            return {
              ...option,
              sectionId: "location",
              combinedName: getOperatorDisplayName(
                option,
                "string",
                t`Location`,
              ),
            };
          })
        : LOCATION_OPTIONS,
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
    areFieldFilterOperatorsEnabled() && {
      id: "number",
      name: t`Number`,
      description: t`Subtotal, Age, Price, Quantity, etc.`,
      options: PARAMETER_OPERATOR_TYPES["number"].map(option => {
        return {
          ...option,
          sectionId: "number",
          combinedName: getOperatorDisplayName(option, "number", t`Number`),
        };
      }),
    },
    areFieldFilterOperatorsEnabled()
      ? {
          id: "string",
          name: t`Text or Category`,
          description: t`Name, Rating, Description, etc.`,
          options: PARAMETER_OPERATOR_TYPES["string"].map(option => {
            return {
              ...option,
              sectionId: "string",
              combinedName: getOperatorDisplayName(option, "string", t`Text`),
            };
          }),
        }
      : {
          id: "category",
          name: t`Other Categories`,
          description: t`Category, Type, Model, Rating, etc.`,
          options: [CATEGORY_OPTION],
        },
  ].filter(Boolean);
}
