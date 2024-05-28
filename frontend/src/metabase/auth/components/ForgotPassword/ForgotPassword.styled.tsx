import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

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
  margin-bottom: 1rem;
`;

export const InfoLink = styled(Link)`
  color: ${color("text-dark")};
  margin-top: 2.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;
