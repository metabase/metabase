import styled from "styled-components";

import Button from "metabase/components/Button";
import { color, alpha } from "metabase/lib/colors";

// NOTE: some of this is duplicated from NotebookCell.jsx
const ViewButton = styled(Button)`
  background-color: ${({ active, color = getDefaultColor() }) =>
    active ? color : alpha(color, 0.2)};
  color: ${({ active, color = getDefaultColor() }) =>
    active ? "white" : color};
  border: none;
  &:hover {
    background-color: ${({ active, color = getDefaultColor() }) =>
      active ? alpha(color, 0.8) : alpha(color, 0.35)};
    color: ${({ active, color = getDefaultColor() }) =>
      active ? "white" : color};
  }
  transition: background 300ms linear, border 300ms linear;
  > .Icon {
    opacity: 0.6;
  }
`;

const getDefaultColor = () => color("brand");

export default ViewButton;
