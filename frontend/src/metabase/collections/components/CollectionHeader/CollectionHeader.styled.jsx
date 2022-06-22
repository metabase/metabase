import styled from "@emotion/styled";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: ${space(3)};
  padding-top: ${space(0)};

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: ${space(1)};
  }
`;

export const DescriptionHeading = styled.div`
  font-size: 1rem;
  line-height: 1.5rem;
  padding-top: 1.15rem;
  max-width: 400px;
`;

export const TitleContent = styled.div`
  display: flex;
  align-items: center;
`;
