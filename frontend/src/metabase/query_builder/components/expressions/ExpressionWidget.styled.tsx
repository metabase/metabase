import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";

export const Container = styled.div`
  width: 472px;
`;

export const FieldWrapper = styled.div`
  padding: 0 1.5rem 1.5rem;
`;

export const ExpressionFieldWrapper = styled.div`
  padding: 1.5rem 1.5rem 1rem;
`;

export const FieldTitle = styled.div`
  display: flex;
  margin-bottom: 0.5rem;

  font-weight: 700;
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.06em;

  color: ${color("text-light")};
`;

export const InfoLink = styled(ExternalLink)`
  margin-left: 4px;

  &:hover,
  :focus {
    color: ${color("brand")};
  }
`;

export const StyledFieldTitleIcon = styled(Icon)`
  width: 10px;
  height: 10px;
`;

export const Footer = styled.div`
  padding: 0.5rem 1.5rem 1.5rem;

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

  display: flex;
  gap: 1rem;
`;
