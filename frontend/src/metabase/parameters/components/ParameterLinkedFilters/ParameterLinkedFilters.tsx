import React, { useMemo } from "react";
import { jt, t } from "ttag";
import { Parameter } from "metabase-types/api";
import { usableAsLinkedFilter } from "../../utils/linked-filters";
import {
  SectionRoot,
  SectionHeader,
  SectionMessage,
  SectionMessageLink,
} from "./ParameterLinkedFilters.styled";

export interface ParameterLinkedFiltersProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onShowAddParameterPopover: () => void;
}

const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onShowAddParameterPopover,
}: ParameterLinkedFiltersProps): JSX.Element => {
  const usableParameters = useMemo(
    () => otherParameters.filter(usableAsLinkedFilter),
    [otherParameters],
  );

  return (
    <SectionRoot>
      <SectionHeader>{t`Limit this filter's choices`}</SectionHeader>
      {usableParameters.length === 0 ? (
        <div>
          <SectionMessage>
            {t`If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.`}
          </SectionMessage>
          <SectionMessage>
            {jt`So first, ${(
              <SectionMessageLink
                key="link"
                onClick={onShowAddParameterPopover}
              >
                {t`add another dashboard filter`}
              </SectionMessageLink>
            )}.`}
          </SectionMessage>
        </div>
      ) : (
        <div>
          <SectionMessage>
            {jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
              <em key="text">{t`this`}</em>
            )} filter.`}
          </SectionMessage>
        </div>
      )}
    </SectionRoot>
  );
};

export default ParameterLinkedFilters;
