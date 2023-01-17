import { t } from "ttag";
import type { FieldType, InputSettingType } from "metabase-types/api";

interface FieldOptionType {
  value: FieldType;
  name: string;
}

export const getFieldTypes = (): FieldOptionType[] => [
  {
    value: "string",
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
  value: InputSettingType;
  name: string;
}

interface InputOptionsMap {
  string: InputOptionType[];
  number: InputOptionType[];
  date: InputOptionType[];
  category: InputOptionType[];
}

const getTextInputs = (): InputOptionType[] => [
  {
    value: "string",
    name: t`text`,
  },
  {
    value: "text",
    name: t`long text`,
  },
];

const getSelectInputs = (): InputOptionType[] => [
  {
    value: "select",
    name: t`dropdown`,
  },
  {
    value: "radio",
    name: t`inline select`,
  },
];

export const getInputTypes = (): InputOptionsMap => ({
  string: [...getTextInputs(), ...getSelectInputs()],
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
    // {
    //   value: "monthyear",
    //   name: t`month + year`,
    // },
    // {
    //   value: "quarteryear",
    //   name: t`quarter + year`,
    // },
  ],
  category: [...getSelectInputs()],
});
