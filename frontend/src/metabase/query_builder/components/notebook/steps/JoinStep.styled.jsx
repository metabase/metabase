import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space, breakpointMaxMedium } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";
import { Button } from "metabase/core/components/Button";
import { NotebookCell } from "../NotebookCell";

export const Row = styled.div`
  display: flex;
  align-items: center;
`;

export const JoinStepRoot = styled.div`
  display: flex;
  align-items: center;
`;

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

export const JoinStrategyIcon = styled(Icon)`
  color: ${color("brand")};
  margin-right: 6px;
  margin-left: 2px;
  margin-top: 6px;
`;

JoinStrategyIcon.defaultProps = { size: 32 };

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

export const JoinTypeIcon = styled(Icon)`
  margin-right: ${space(1)};
  color: ${props => (props.isSelected ? color("text-white") : color("brand"))};
`;

JoinTypeIcon.defaultProps = { size: 24 };

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

export const JoinWhereConditionLabel = styled.span`
  color: ${color("brand")};
  font-weight: bold;
  margin: 0 ${space(2)};
`;

JoinWhereConditionLabel.defaultProps = { children: "on" };

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

export const RemoveDimensionIcon = styled(Icon)`
  cursor: pointer;
  color: ${color("text-white")};
  opacity: 0.65;
  margin-left: 12px;
`;

RemoveDimensionIcon.defaultProps = { name: "close" };

export const RemoveJoinIcon = styled(Icon)`
  cursor: pointer;
  color: ${color("text-light")};

  :hover {
    color: ${color("text-medium")};
  }
`;

RemoveJoinIcon.defaultProps = { name: "close", size: 18 };

export const PrimaryJoinCell = styled(NotebookCell)`
  flex: 1;
  align-self: start;
`;

export const SecondaryJoinCell = styled(NotebookCell)`
  flex: 1;
  flex-direction: column;
  align-items: start;
`;

export const JoinOperatorButton = styled(Button)`
  width: 36px;
  height: 36px;
  font-size: 16px;
  padding: 0;
`;
