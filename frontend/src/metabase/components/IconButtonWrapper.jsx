import styled from "@emotion/styled";

const IconButtonWrapper = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => (props.circle ? "50%" : "6px")};
  cursor: pointer;
`;

IconButtonWrapper.defaultProps = { type: "button" };

export default IconButtonWrapper;
