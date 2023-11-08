import styled from "styled-components";
import { space } from "styled-system";

import { DefaultSearchColor } from "metabase/nav/constants";
import { color, lighten } from "metabase/lib/colors";

const ActiveSearchColor = lighten(color("nav"), 0.1);

export const SearchWrapper = styled.div`
  display: flex;
  position: relative;
  background-color: ${props =>
    props.active ? ActiveSearchColor : DefaultSearchColor};
  border-radius: 6px;
  flex: 1 1 auto;
  max-width: 50em;
  align-items: center;
  color: white;
  transition: background 300ms ease-in;
  &:hover {
    background-color: ${ActiveSearchColor};
  }
`;

export const SearchInput = styled.input`
  ${space};
  background-color: transparent;
  width: 100%;
  border: none;
  color: white;
  font-size: 1em;
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-white")};
  }
`;
