import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

const TRANSITION_TIME = "200ms";

export const ActionParameterTriggerContainer = styled.button`
  position: absolute;
  top: -10px;
  right: -10px;
  background: ${color("white")};
  color: ${color("brand")};
  border: 2px solid ${color("brand")};
  border-radius: 50%;
  width: 22px;
  height: 22px;
  z-index: 3;
  pointer-events: all;
  cursor: pointer;

  transition: background ${TRANSITION_TIME} ease-in-out;
  transition: color ${TRANSITION_TIME} ease-in-out;

  &:hover {
    color: ${color("white")};
    background: ${color("brand")};
  }
`;

export const ParameterMapperTitleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${space(1)};
`;

export const ParameterMapperContainer = styled.div`
  padding: 1.5rem;
  min-width: 15rem;
`;

export const ParameterFormSection = styled.div`
  margin-top: ${space(2)};
`;

export const ParameterFormLabel = styled.label`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  display: block;
  margin-bottom: ${space(1)};
  font-weight: bold;
`;
