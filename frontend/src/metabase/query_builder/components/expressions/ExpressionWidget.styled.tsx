import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";

export const Container = styled.div`
  width: 445px;
`;

export const FieldWrapper = styled.div`
  padding: 0 1.5rem 1.5rem;
`;

export const ExpressionFieldWrapper = styled.div`
  padding: 1.5rem 1.5rem 1rem;
`;

export const FieldTitle = styled.div`
  margin-bottom: 0.5rem;

  font-weight: 700;
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.06em;

  color: ${color("text-light")};
`;

export const IconWrapper = styled.span`
  margin-left: 4px;
  cursor: help;

  &:hover {
    color: ${color("text-dark")};
  }
`;

export const StyledFieldTitleIcon = styled(Icon)`
  width: 10px;
  height: 10px;
`;

export const Divider = styled.div`
  width: 100%;
  height: 1px;
  background-color: ${color("border")};
  margin-top: 0.5rem;
`;

export const Footer = styled.div`
  padding: 1.5rem;

  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

export const RemoveLink = styled(Button)`
  padding-right: 1rem;
`;

export const ActionButtonsWrapper = styled.div`
  margin-left: auto;

  & > ${Button} + ${Button} {
    margin-left: 1rem;
  }

  & > ${Button} + ${RemoveLink} {
    margin-left: 1rem;
  }
`;
