import React from "react";
import { t } from "c-3po";
import Select, { Option } from "metabase/components/Select";

export const component = Select;

const fixture = [
  { name: t`Blue`, value: "blue" },
  { name: t`Green`, value: "green" },
  { name: t`Red`, value: "red" },
  { name: t`Yellow`, value: "yellow" },
];

export const description = t`
    A component used to make a selection
`;

export const examples = {
  Default: (
    <Select value="yellow" onChange={() => alert(t`Selected`)}>
      {fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
    </Select>
  ),
  "With search": (
    <Select
      value="yellow"
      searchProp="name"
      onChange={() => alert(t`Selected`)}
    >
      {fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
    </Select>
  ),
};
