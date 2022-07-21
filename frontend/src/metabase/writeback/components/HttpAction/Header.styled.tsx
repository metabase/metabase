import styled from "@emotion/styled";
import EditableTextBase from "metabase/core/components/EditableText";
import ButtonBase from "metabase/core/components/Button";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${color("white")};
  padding: ${space(1)} ${space(3)};
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-light")};

  & > * ~ * {
    margin-left: ${space(2)};
    margin-right: ${space(2)};
  }
`;

export const RightHeader = styled(ButtonBase)<{ enabled: boolean }>`
  font-weight: 600;
  color: ${props => (props.enabled ? color("brand") : color("text-medium"))};
  background-opacity: 0.25;
  padding: 0;

  &:hover {
    color: ${color("accent0-light")};
  }
`;

export const EditableText = styled(EditableTextBase)`
  font-weight: bold;
  font-size: 0.85em;
`;

export const Option = styled.div`
  color: ${color("text-light")};
`;
