import styled from "@emotion/styled";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  OptionItemDescription,
  OptionItemRoot,
  OptionItemTitle,
} from "metabase/dashboard/components/ParametersPopover.styled";
import {
  getDashboardParameterSections,
  getDefaultOptionForParameterSectionMap,
} from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon } from "metabase/ui";
import type { ParameterMappingOptions } from "metabase-types/api";

const PopoverBody = styled.div`
  max-width: 300px;
`;

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
}: ParametersPopoverProps) => {
  return (
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
};

const ParameterOptionsSection = ({
  section,
  onClick,
}: {
  section: ParameterSection;
  onClick: () => void;
}) => (
  <OptionItemRoot onClick={onClick}>
    <OptionItemTitle
      className={cx(CS.textBold, CS.flex, CS.alignCenter)}
      style={{ marginBottom: 4 }}
    >
      <Icon
        size="16"
        name={getParameterIconName(section.id)}
        className={CS.mr1}
      />
      {section.name}
    </OptionItemTitle>
    <OptionItemDescription>{section.description}</OptionItemDescription>
  </OptionItemRoot>
);

const ParameterOptionsSectionsPane = ({
  sections,
  onSelectSection,
}: {
  sections: ParameterSection[];
  onSelectSection: (section: ParameterSection) => void;
}) => (
  <PopoverBody className={CS.pb2}>
    <h3
      className={cx(CS.pb2, CS.pt3, CS.px3)}
    >{t`What do you want to filter?`}</h3>
    <ul>
      {sections.map(section => (
        <ParameterOptionsSection
          key={section.id}
          section={section}
          onClick={() => onSelectSection(section)}
        />
      ))}
    </ul>
  </PopoverBody>
);
