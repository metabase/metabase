import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const FormRoot = styled.form`
  width: 100%;
`;

export const FormSection = styled.div`
  margin: 0 auto;
  padding: 0 1em;
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

export const FormBody = styled(FormSection)`
  padding-top: 4rem;
  padding-bottom: 4rem;
`;

export const FormFooter = styled.div`
  padding-top: 4rem;
  padding-bottom: 4rem;
  border-top: 1px solid ${color("border")};
`;

export const FormContainer = styled.div`
  max-width: 576rem;
`;
