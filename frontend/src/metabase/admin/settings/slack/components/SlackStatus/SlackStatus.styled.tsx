import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const HeaderPrimary = styled.div`
  flex: 1 1 auto;
`;

export const HeaderSecondary = styled.div`
  flex: 0 0 auto;
`;

export const HeaderTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
  line-height: 1.875rem;
  margin-bottom: 0.5rem;
`;

export const HeaderMessage = styled.div`
  color: ${color("text-medium")};
`;
