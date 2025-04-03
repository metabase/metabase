/* eslint-disable react/prop-types */
import { Component } from "react";
import _ from "underscore";

import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { useTranslateContent2 } from "metabase/i18n/components/ContentTranslationContext";
import { Icon } from "metabase/ui";

export const ParameterTargetList = ({
  mappingOptions,
  selectedMappingOption,
  maxHeight,
  onChange,
}) => {
  const tc = useTranslateContent2();
  const mappingOptionSections = _.groupBy(mappingOptions, "sectionName");

  const hasForeignOption = _.any(mappingOptions, (o) => !!o.isForeign);

  const sections = _.map(mappingOptionSections, (options) => ({
    name: options[0].sectionName,
    items: options.map((opt) => ({ ...opt, name: tc(opt.name) })),
  }));

  return (
    <AccordionList
      className={CS.textBrand}
      maxHeight={maxHeight || 600}
      sections={sections}
      onChange={(item) => onChange(item.target)}
      itemIsSelected={(item) => item === selectedMappingOption}
      renderItemIcon={(item) => (
        <Icon name={item.icon || "unknown"} size={18} />
      )}
      alwaysExpanded={true}
      hideSingleSectionTitle={!hasForeignOption}
    />
  );
};
