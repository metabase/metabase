import React from "react";
import { t } from "c-3po";
import Select, { Option } from "metabase/components/Select";

export const component = Select;

const fixture = [
  { name: t`Blue` },
  { name: t`Green` },
  { name: t`Red` },
  { name: t`Yellow` },
];

export const description = t`
    A component used to make a selection
`;

export const examples = {
  Default: (
    <Select onChange={() => alert(t`Selected`)}>
      {fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
    </Select>
  ),
  "With search": (
    <Select searchProp="name" onChange={() => alert(t`Selected`)}>
      {fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
    </Select>
  ),
};
