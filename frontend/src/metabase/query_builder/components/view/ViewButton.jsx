import Button from "metabase/components/Button";
import { color, alpha } from "metabase/lib/colors";

import styled from "styled-components";

// NOTE: some of this is duplicated from NotebookCell.jsx
const ViewButton = styled(Button)`
  background-color: ${props =>
    props.active ? props.color : alpha(props.color, 0.2)};
  color: ${props => (props.active ? "white" : props.color)};
  border: none;
  &:hover {
    background-color: ${props =>
      props.active ? alpha(props.color, 0.8) : alpha(props.color, 0.35)};
    color: ${props => (props.active ? "white" : props.color)};
  }
  transition: background 300ms linear, border 300ms linear;
  > .Icon {
    opacity: 0.6;
  }
`;
ViewButton.defaultProps = {
  color: color("brand"),
};

export default ViewButton;
