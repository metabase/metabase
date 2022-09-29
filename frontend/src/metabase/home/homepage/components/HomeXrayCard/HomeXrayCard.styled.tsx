import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";

export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: ${color("white")};
  width: 1rem;
  height: 1rem;
`;

export const CardIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  padding: 0.25rem;
  border-radius: 0.5rem;
  background-color: ${color("accent4")};
`;

export const CardTitle = styled(Ellipsified)`
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
`;

export const CardTitlePrimary = styled.span`
  color: ${color("text-dark")};
`;

export const CardTitleSecondary = styled.span`
  color: ${color("text-medium")};
`;
