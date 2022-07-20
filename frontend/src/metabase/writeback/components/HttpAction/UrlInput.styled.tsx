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
  padding: 0 ${space(3)} 0 ${space(4)};
  background: transparent;
`;

export const TextArea = styled.textarea`
  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;

  resize: none;
`;

export const Select = styled.select`
  height: 100%;
  padding: 0 ${space(1)} 0 ${space(3)};
  font-weight: bold;
`;
