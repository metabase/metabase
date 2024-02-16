import { t } from "ttag";

import type { FieldType, InputSettingType } from "metabase-types/api";

interface FieldOptionType {
  value: FieldType;
  name: string;
}

interface InputOptionType {
  value: InputSettingType;
  name: string;
}

type InputOptionsMap = Record<FieldType, InputOptionType[]>;

export const getFieldTypes = (): FieldOptionType[] => [
  {
    value: "string",
    name: t`Text`,
  },
  {
    value: "number",
    name: t`Number`,
  },
  {
    value: "date",
    name: t`Date`,
  },
];

const getTextInputs = (): InputOptionType[] => [
  {
    value: "string",
    name: t`Text`,
  },
  {
    value: "text",
    name: t`Long text`,
  },
];

const getSelectInputs = (): InputOptionType[] => [
  {
    value: "select",
    name: t`Dropdown`,
  },
  {
    value: "radio",
    name: t`Inline select`,
  },
];

export const getInputTypes = (): InputOptionsMap => ({
  string: [...getTextInputs(), ...getSelectInputs()],
  number: [
    {
      value: "number",
      name: t`Number`,
    },
    ...getSelectInputs(),
  ],
  date: [
    {
      value: "date",
      name: t`Date`,
    },
    {
      value: "datetime",
      name: t`Date + time`,
    },
  ],
});
