import _ from "underscore";

import { AccordionList } from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import type {
  ParameterMappingOption,
  StructuredQuerySectionOption,
} from "metabase/parameters/utils/mapping-options";
import { Icon, type IconName } from "metabase/ui";
import type { ParameterTarget } from "metabase-types/api";

export type ParameterTargetListProps = {
  mappingOptions: ParameterMappingOption[];
  selectedMappingOption?: ParameterMappingOption;
  onChange: (target: ParameterTarget) => void;
  maxHeight?: number;
};

function isStructuredQuerySectionOption(
  option: ParameterMappingOption,
): option is StructuredQuerySectionOption {
  return "sectionName" in option;
}

export const ParameterTargetList = ({
  mappingOptions,
  selectedMappingOption,
  maxHeight,
  onChange,
}: ParameterTargetListProps) => {
  const mappingOptionSections = _.groupBy(mappingOptions, "sectionName");

  const hasForeignOption = _.any(mappingOptions, (o) => !!o.isForeign);

  const sections = _.map(mappingOptionSections, (options) => {
    let sectionName = "";
    const firstOption = options[0];

    if (isStructuredQuerySectionOption(firstOption)) {
      sectionName = firstOption.sectionName;
    }

    return {
      name: sectionName,
      items: options,
    };
  });

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
      alwaysExpanded
      globalSearch
      hideSingleSectionTitle={!hasForeignOption}
    />
  );
};
