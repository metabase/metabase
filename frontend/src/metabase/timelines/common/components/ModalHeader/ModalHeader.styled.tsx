import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 0;
`;

export const HeaderTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
  margin-right: 1rem;
  min-width: 0;
`;

export const HeaderActions = styled.div`
  margin-right: 1rem;
`;

export const HeaderBackButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-dark")};
  padding: 0.25rem 0.5rem;
  margin-left: -0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const HeaderCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;
