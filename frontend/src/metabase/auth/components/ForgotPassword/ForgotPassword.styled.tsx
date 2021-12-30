import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

export const FormTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1.5rem;
`;

export const FormFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
`;

export const FormLink = styled(Link)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const InfoBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const InfoIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const InfoIconContainer = styled.div`
  padding: 1.25rem;
  border-radius: 50%;
  background-color: ${color("brand-light")};
  margin-bottom: 1.5rem;
`;

export const InfoTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const InfoMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
`;

export const InfoLink = styled(Link)`
  margin-top: 2.5rem;
`;
