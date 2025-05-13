/* eslint-disable react/prop-types */
import _ from "underscore";

import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import type {
  ParameterMappingOption,
  StructuredQuerySectionOption,
} from "metabase/parameters/utils/mapping-options";
import { Icon, type IconName } from "metabase/ui";
import type { ParameterTarget } from "metabase-types/api";

export type ParameterTargetListProps = {
  mappingOptions: StructuredQuerySectionOption[];
  selectedMappingOption?: ParameterMappingOption;
  onChange: (target: ParameterTarget) => void;
  maxHeight?: number;
};

export const ParameterTargetList = ({
  mappingOptions,
  selectedMappingOption,
  maxHeight,
  onChange,
}: ParameterTargetListProps) => {
  // Only group options that have sectionName
  const mappingOptionSections = _.groupBy(mappingOptions, "sectionName");

  const hasForeignOption = _.any(mappingOptions, (o) => !!o.isForeign);

  const sections = _.map(mappingOptionSections, (options) => ({
    name: (options[0] as StructuredQuerySectionOption).sectionName,
    items: options,
  }));

  return (
    <AccordionList
      className={CS.textBrand}
      maxHeight={maxHeight || 600}
      sections={sections}
      onChange={(item: ParameterMappingOption) => onChange(item.target)}
      itemIsSelected={(item: ParameterMappingOption) =>
        item === selectedMappingOption
      }
      renderItemIcon={(item: ParameterMappingOption) => (
        <Icon name={(item.icon as IconName) || "unknown"} size={18} />
      )}
      alwaysExpanded={true}
      hideSingleSectionTitle={!hasForeignOption}
    />
  );
};
