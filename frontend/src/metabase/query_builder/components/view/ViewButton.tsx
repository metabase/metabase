import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color, alpha } from "metabase/lib/colors";

type Props = {
  active?: boolean;
  color?: string;
};

// NOTE: some of this is duplicated from NotebookCell.jsx
const ViewButton = styled(Button)<Props>`
  background-color: ${({ active, color = getDefaultColor() }) =>
    active ? color : alpha(color, 0.2)};

  color: ${({ active, color = getDefaultColor() }) =>
    active ? "white" : color};

  border: none;
  transition: background 300ms linear, border 300ms linear;

  &:hover {
    background-color: ${({ active, color = getDefaultColor() }) =>
      active ? alpha(color, 0.8) : alpha(color, 0.35)};
    color: ${({ active, color = getDefaultColor() }) =>
      active ? "white" : color};
  }

  > .Icon {
    opacity: 0.6;
  }
`;

const getDefaultColor = () => color("brand");

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ViewButton;
