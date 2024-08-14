import { t } from "ttag";
import _ from "underscore";

import {
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Box, Icon, Text } from "metabase/ui";
import type { ParameterMappingOptions } from "metabase-types/api";

import S from "./ParametersPopover.module.css";

interface ParametersPopoverProps {
  onClose: () => void;
  onAddParameter: (parameter: ParameterMappingOptions) => void;
}

const defaultOptionForParameterSection =
  getDefaultOptionForParameterSectionMap();
const PARAMETER_SECTIONS = getDashboardParameterSections();

type ParameterSection = typeof PARAMETER_SECTIONS[number];

export const ParametersPopover = ({
  onClose,
  onAddParameter,
}: ParametersPopoverProps) => (
  <ParameterOptionsSectionsPane
    sections={PARAMETER_SECTIONS}
    onSelectSection={selectedSection => {
      const parameterSection = _.findWhere(PARAMETER_SECTIONS, {
        id: selectedSection.id,
      });

      if (parameterSection) {
        const defaultOption =
          defaultOptionForParameterSection[parameterSection.id];

        if (defaultOption) {
          onAddParameter(defaultOption);
        }
        onClose();
      }
    }}
  />
);

const ParameterOptionsSection = ({
  section,
  onClick,
}: {
  section: ParameterSection;
  onClick: () => void;
}) => (
  <Box className={S.row} display="table-row" onClick={onClick}>
    <Box className={S.iconCell} display="table-cell" pl="lg" pr="sm" py="sm">
      <Icon
        className={S.icon}
        size="16"
        name={getParameterIconName(section.id)}
      />
    </Box>
    <Box display="table-cell" py="sm" fw="bold">
      {section.name}
    </Box>
    <Box className={S.descriptionCell} display="table-cell" px="lg" py="sm">
      {section.description}
    </Box>
  </Box>
);

const ParameterOptionsSectionsPane = ({
  sections,
  onSelectSection,
}: {
  sections: ParameterSection[];
  onSelectSection: (section: ParameterSection) => void;
}) => (
  <Box py="md">
    <Text px="lg" pb="md" c="text-light" fw="bold">
      {t`Add a filter or parameter`}
    </Text>
    <Box display="table">
      {sections.map(section => (
        <ParameterOptionsSection
          key={section.id}
          section={section}
          onClick={() => onSelectSection(section)}
        />
      ))}
    </Box>
  </Box>
);
