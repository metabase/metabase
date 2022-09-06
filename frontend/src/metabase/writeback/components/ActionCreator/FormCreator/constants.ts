import { t } from "ttag";
import type { FieldType, InputType } from "metabase-types/api";

interface FieldOptionType {
  value: FieldType;
  name: string;
}

export const getFieldTypes = (): FieldOptionType[] => [
  {
    value: "text",
    name: t`text`,
  },
  {
    value: "number",
    name: t`number`,
  },
  {
    value: "date",
    name: t`date`,
  },
  {
    value: "category",
    name: t`category`,
  },
];

interface InputOptionType {
  value: InputType;
  name: string;
}

interface InputOptionsMap {
  text: InputOptionType[];
  number: InputOptionType[];
  date: InputOptionType[];
  category: InputOptionType[];
}

const getTextInputs = (): InputOptionType[] => [
  {
    value: "text",
    name: t`long text`,
  },
  {
    value: "string",
    name: t`text`,
  },
];

const getSelectInputs = (): InputOptionType[] => [
  {
    value: "dropdown",
    name: t`dropdown`,
  },
  {
    value: "inline-select",
    name: t`inline select`,
  },
];

export const getInputTypes = (): InputOptionsMap => ({
  text: [...getTextInputs(), ...getSelectInputs()],
  number: [
    {
      value: "number",
      name: t`number`,
    },
    ...getSelectInputs(),
  ],
  date: [
    {
      value: "date",
      name: t`date`,
    },
    {
      value: "datetime",
      name: t`date + time`,
    },
    {
      value: "monthyear",
      name: t`month + year`,
    },
    {
      value: "quarteryear",
      name: t`quarter + year`,
    },
  ],
  category: [...getSelectInputs()],
});
