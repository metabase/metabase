import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Button from "metabase/core/components/Button";

export const PickerButton = styled(Button)`
  display: block;
  border: none;
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px ${color("text-light")};
  opacity: 0.5;
`;
