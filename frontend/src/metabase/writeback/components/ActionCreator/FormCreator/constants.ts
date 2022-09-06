import { t } from "ttag";
import type { FieldType, InputType } from "metabase-types/api/writeback";

interface FieldOptionType {
  value: FieldType;
  name: string;
}

export const fieldTypes: FieldOptionType[] = [
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

const textInputs: InputOptionType[] = [
  {
    value: "longtext",
    name: t`long text`,
  },
  {
    value: "text",
    name: t`text`,
  },
];

const selectInputs: InputOptionType[] = [
  {
    value: "dropdown",
    name: t`dropdown`,
  },
  {
    value: "inline-select",
    name: t`inline select`,
  },
];

export const inputTypes: InputOptionsMap = {
  text: [...textInputs, ...selectInputs],
  number: [
    {
      value: "number",
      name: t`number`,
    },
    ...selectInputs,
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
  category: [...selectInputs],
};
