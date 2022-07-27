import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const LogoRoot = styled.div`
  position: relative;
`;

export const LogoLink = styled(Link)`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  padding: 0.5rem 1rem;
  transition: opacity 0.3s;
`;

export const ToggleContainer = styled.div`
  position: fixed;
  top: 90%;
  transition: opacity 0.3s;
`;
