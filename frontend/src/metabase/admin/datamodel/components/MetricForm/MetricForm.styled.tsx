import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const FormRoot = styled.form`
  width: 100%;
`;

export const FormContainer = styled.div`
  margin: 0 auto;
  padding: 4rem 1em;
  width: 100%;

  ${breakpointMinSmall} {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }

  ${breakpointMinMedium} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;

export const FormBody = styled.div`
  max-width: 576rem;
`;
