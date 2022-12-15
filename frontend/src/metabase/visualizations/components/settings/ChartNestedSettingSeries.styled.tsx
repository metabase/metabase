import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";

export const OptionsIcon = styled(Icon)`
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const SeriesNameInput = styled(InputBlurChange)`
  width: auto;
`;
