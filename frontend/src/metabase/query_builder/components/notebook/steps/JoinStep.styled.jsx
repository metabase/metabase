import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { space, breakpointMaxMedium } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

export const Row = styled.div`
  display: flex;
  align-items: center;
`;

export const JoinStepRoot = forwardRefToInnerRef(styled.div`
  display: flex;
  align-items: center;
`);

export const JoinClausesContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

export const JoinClauseContainer = styled.div`
  margin-bottom: ${props => (props.isLast ? 0 : "2px")};
`;

export const JoinClauseRoot = styled.div`
  display: flex;
  margin-bottom: ${props => (props.isLast ? 0 : "2px")};
`;

export const JoinStrategyIcon = styled(Icon).attrs({ size: 32 })`
  color: ${color("brand")};
  margin-right: 6px;
  margin-left: 2px;
  margin-top: 6px;
`;

export const JoinTypeSelectRoot = styled.div`
  margin: ${space(1)} ${space(1)} 0 ${space(1)};
`;

export const JoinTypeOptionRoot = styled.div`
  display: flex;
  align-items: center;
  padding: ${space(1)};
  margin-bottom: ${space(1)};
  cursor: pointer;
  border-radius: ${space(1)};

  color: ${props => props.isSelected && color("text-white")};
  background-color: ${props => props.isSelected && color("brand")};

  :hover {
    color: ${color("text-white")};
    background-color: ${color("brand")};

    .Icon {
      color: ${color("text-white")};
    }
  }
`;

export const JoinTypeIcon = styled(Icon).attrs({ size: 24 })`
  margin-right: ${space(1)};
  color: ${props => (props.isSelected ? color("text-white") : color("brand"))};
`;

export const JoinDimensionControlsContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;

  margin-top: ${props => (props.isFirst ? 0 : space(1))};

  ${breakpointMaxMedium} {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const JoinWhereConditionLabelContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
`;

export const JoinWhereConditionLabel = styled.span.attrs({ children: "on" })`
  color: ${color("brand")};
  font-weight: bold;
  margin: 0 ${space(2)};
`;

export const JoinConditionLabel = styled.span`
  font-size: 20;
  font-weight: bold;
  color: ${color("text-medium")};
  margin-left: 2px;
  margin-right: 6px;
`;

export const DimensionContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const DimensionSourceName = styled.div`
  display: block;
  font-size: 11px;
  color: ${color("text-white")};
  opacity: 0.65;
`;

export const RemoveDimensionIcon = styled(Icon).attrs({ name: "close" })`
  cursor: pointer;
  color: ${color("text-white")};
  opacity: 0.65;
  margin-left: 12px;
`;

export const RemoveJoinIcon = styled(Icon).attrs({ name: "close", size: 18 })`
  cursor: pointer;
  color: ${color("text-light")};

  :hover {
    color: ${color("text-medium")};
  }
`;
