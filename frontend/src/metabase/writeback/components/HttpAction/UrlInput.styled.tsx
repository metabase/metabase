import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  align-items: start;
`;

export const UrlContainer = styled.div`
  flex-grow: 1;
  width: 100%;
  min-height: 0;
  padding: 0 ${space(3)} 0 ${space(3)};
  background: transparent;
`;

export const TextArea = styled.textarea`
  font-size: 0.85rem;
  width: 100%;
  min-height: 0px;
  padding: 0 ${space(3)} 0 ${space(1)};
  background: transparent;
  border-color: transparent;

  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;
  resize: none;

  &:focus {
    color: ${color("text-dark")};
    border: transparent;
  }

  &::placeholder {
    color: ${color("text-light")};
  }
`;

export const Select = styled.select`
  color: ${color("text-medium")};
  height: 100%;
  padding: 0 calc(${space(1)} + ${space(2)}) 0 ${space(3)};
  font-weight: 600;
  font-size: 0.85rem;

  background-color: transparent;
  border-color: transparent;

  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;
`;
