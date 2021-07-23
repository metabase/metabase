import styled from "styled-components";

const IconButtonWrapper = styled.button.attrs({ type: "button" })`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => (props.circle ? "50%" : "6px")};
`;

export default IconButtonWrapper;
