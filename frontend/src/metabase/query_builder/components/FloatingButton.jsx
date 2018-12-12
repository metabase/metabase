import styled from "styled-components";
import Button from "metabase/components/Button";

const FloatingButton = styled(Button)`
  padding: 1em;
  border: none;
  border-radius: 99px;
  box-shadow: 0 2px 3px 3px rgba(0, 0, 0, 0.12);
`;

FloatingButton.defaultProps = {
  iconSize: 22,
};

export default FloatingButton;
