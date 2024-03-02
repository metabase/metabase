import styled from "@emotion/styled";

import { DatabaseHelpCard } from "metabase/databases/components/DatabaseHelpCard";
import {
  breakpointMinSmall,
  breakpointMinMedium,
} from "metabase/styled-components/theme";

export const DatabaseEditRoot = styled.div`
  margin-top: 0.5rem;
  padding-left: 2rem;
  padding-right: 2rem;

  ${breakpointMinSmall} {
    margin-top: 1rem;
    padding-left: 4rem;
    padding-right: 4rem;
  }

  ${breakpointMinMedium} {
    margin-top: 2rem;
    padding-left: 8rem;
    padding-right: 8rem;
  }
`;

export const DatabaseEditMain = styled.div`
  display: flex;
  padding-bottom: 1rem;
`;

export const DatabaseEditForm = styled.div`
  width: 38.75rem;
`;

export const DatabaseEditContent = styled.div`
  display: flex;
`;

export const DatabaseEditHelp = styled(DatabaseHelpCard)`
  max-width: 21rem;
  margin-top: 1.25rem;
  margin-left: 6.5rem;
`;
