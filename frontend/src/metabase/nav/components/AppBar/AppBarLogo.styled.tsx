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

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const ToggleContainer = styled.div`
  position: absolute;
  top: 0.625rem;
  left: 0.9375rem;
  transition: opacity 0.3s;
`;

export const DadosferaLogo = styled.div`
  display: flex;
  height: 100%;
  align-items: center;
  border-left: 1px solid #eeecec;
  margin: 5px 10px;
  padding: 5px 10px;
  font-weight: bold;
  color: #4c5773;

  > span {
    margin-top: 3px;
  }

  > img {
    margin-left: 5px;
    width: 20px;
  }
`;
