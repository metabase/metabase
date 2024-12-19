import styled from "@emotion/styled";

export const EChartsRendererRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  /* HACK: zrender adds user-select: none to the root svg element which prevents users from selecting text on charts */
  & svg {
    user-select: auto !important;
  }
`;
