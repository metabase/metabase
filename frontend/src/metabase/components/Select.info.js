import React from "react";
import { t } from "ttag";
import Select from "metabase/components/Select";

export const component = Select;

export const description = t`
    A component used to make a selection
`;

import _ from "underscore";
import { field_special_types } from "metabase/lib/core";
const EXAMPLE_SECTIONS = _.chain(field_special_types)
  .first(10)
  .groupBy("section")
  .pairs()
  .map(([section, items]) => ({
    name: section,
    items: items.map(item => ({
      name: item.name,
      value: item.id,
      icon:
        item.id === "type/FK"
          ? "connections"
          : item.id === "type/Name"
          ? "string"
          : item.id === "type/PK"
          ? "unknown"
          : null,
      description: item.description,
    })),
  }))
  .value();
const EXAMPLE_OPTIONS = EXAMPLE_SECTIONS.map(section => section.items).flat();

export const examples = {
  default: (
    <Select defaultValue={EXAMPLE_OPTIONS[0].value} options={EXAMPLE_OPTIONS} />
  ),
  search: (
    <Select
      defaultValue={EXAMPLE_OPTIONS[0].value}
      options={EXAMPLE_OPTIONS}
      searchProp="name"
    />
  ),
  sections: (
    <Select
      defaultValue={EXAMPLE_OPTIONS[0].value}
      sections={EXAMPLE_SECTIONS}
    />
  ),
  multiple: (
    <Select
      defaultValue={[EXAMPLE_OPTIONS[0].value, EXAMPLE_OPTIONS[3].value]}
      options={EXAMPLE_OPTIONS}
      multiple
    />
  ),
  kitchen_sink: (
    <Select
      defaultValue={[EXAMPLE_OPTIONS[0].value, EXAMPLE_OPTIONS[3].value]}
      sections={EXAMPLE_SECTIONS}
      multiple
      searchProp="name"
    />
  ),
};
