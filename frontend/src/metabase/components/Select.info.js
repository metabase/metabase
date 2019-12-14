import React from "react";
import { t } from "ttag";
import BrowserSelect_, {
  Option,
  Select,
  LegacySelect as LegacySelect_,
} from "metabase/components/Select";

import Uncontrollable from "metabase/hoc/Uncontrollable";
const LegacySelect = Uncontrollable()(LegacySelect_);
const BrowserSelect = Uncontrollable()(BrowserSelect_);

export const component = Select;

export const description = t`
    A component used to make a selection
`;

import _ from "underscore";
import { field_special_types } from "metabase/lib/core";
// import { getIconForField } from "metabase/lib/schema_metadata";
const EXAMPLE_SECTIONS = _.chain(field_special_types)
  .first(10)
  .groupBy("section")
  .pairs()
  .map(([section, items]) => ({
    name: section,
    items: items.map(item => ({
      name: item.name,
      value: item.id,
      // icon: getIconForField({ special_type: item.id }),
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
const EXAMPLE_OPTIONS_WITH_SECTIONS = EXAMPLE_SECTIONS.map(section =>
  section.items.map(item => ({ ...item, section: section.name })),
).flat();

export const examples = {
  default_browser: (
    <BrowserSelect defaultValue={EXAMPLE_OPTIONS[0].value}>
      {EXAMPLE_OPTIONS.map(item => (
        <Option {...item}>{item.name}</Option>
      ))}
    </BrowserSelect>
  ),
  default_legacy: (
    <LegacySelect defaultValue={EXAMPLE_OPTIONS[0]} options={EXAMPLE_OPTIONS} />
  ),
  default_new: (
    <Select defaultValue={EXAMPLE_OPTIONS[0].value} options={EXAMPLE_OPTIONS} />
  ),
  search_browser: (
    <BrowserSelect defaultValue={EXAMPLE_OPTIONS[0].value} searchProp="name">
      {EXAMPLE_OPTIONS.map(item => (
        <Option {...item}>{item.name}</Option>
      ))}
    </BrowserSelect>
  ),
  search_new: (
    <Select
      defaultValue={EXAMPLE_OPTIONS[0].value}
      options={EXAMPLE_OPTIONS}
      searchProp="name"
    />
  ),
  sections_legacy: (
    <LegacySelect
      defaultValue={EXAMPLE_OPTIONS_WITH_SECTIONS[0]}
      options={EXAMPLE_OPTIONS_WITH_SECTIONS}
    />
  ),
  sections_new: (
    <Select
      defaultValue={EXAMPLE_OPTIONS[0].value}
      sections={EXAMPLE_SECTIONS}
    />
  ),
  multiple_browser: (
    <BrowserSelect
      defaultValue={[EXAMPLE_OPTIONS[0].value, EXAMPLE_OPTIONS[3].value]}
      multiple
    >
      {EXAMPLE_OPTIONS.map(item => (
        <Option {...item}>{item.name}</Option>
      ))}
    </BrowserSelect>
  ),
  multiple_new: (
    <Select
      defaultValue={[EXAMPLE_OPTIONS[0].value, EXAMPLE_OPTIONS[3].value]}
      options={EXAMPLE_OPTIONS}
      multiple
    />
  ),
  kitchen_sink_new: (
    <Select
      defaultValue={[EXAMPLE_OPTIONS[0].value, EXAMPLE_OPTIONS[3].value]}
      sections={EXAMPLE_SECTIONS}
      multiple
      searchProp="name"
    />
  ),
};
