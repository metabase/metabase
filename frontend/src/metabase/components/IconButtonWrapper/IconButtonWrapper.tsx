import styled from "@emotion/styled";

const IconButtonWrapper = styled.button<{ circle?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => (props.circle ? "50%" : "6px")};
  cursor: pointer;
`;

IconButtonWrapper.defaultProps = { type: "button" };

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default IconButtonWrapper;
