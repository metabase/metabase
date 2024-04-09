import styled from "@emotion/styled";

import InputBlurChange from "metabase/components/InputBlurChange";
import Input from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const OptionsIcon = styled(Icon)`
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const SeriesNameInput = styled(InputBlurChange)`
  width: auto;

  ${({ subtitle }) =>
    subtitle &&
    `
    ${Input.Field} {
      padding-top: 1rem;
      padding-bottom: 0.375rem;
    }

    ${Input.Subtitle} {
      top: 0.375rem;
      left: 0.8rem;
    }
  `}
`;
