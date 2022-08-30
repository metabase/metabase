import { t } from "ttag";
import type { FieldType, InputType } from "metabase/writeback/types";

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

export const inputTypes: InputOptionsMap = {
  text: [
    {
      value: "text",
      name: t`text`,
    },
    {
      value: "longtext",
      name: t`long text`,
    },
    {
      value: "dropdown",
      name: t`dropdown`,
    },
    {
      value: "inline-select",
      name: t`inline select`,
    },
  ],
  number: [
    {
      value: "number",
      name: t`number`,
    },
    {
      value: "dropdown",
      name: t`dropdown`,
    },
    {
      value: "inline-select",
      name: t`inline select`,
    },
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
  category: [
    {
      value: "dropdown",
      name: t`dropdown`,
    },
    {
      value: "inline-select",
      name: t`inline select`,
    },
  ],
};
