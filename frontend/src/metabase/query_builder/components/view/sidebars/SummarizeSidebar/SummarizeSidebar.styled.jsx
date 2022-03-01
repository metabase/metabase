import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const Section = styled.section`
  padding: 1.5rem;
`;

export const SectionTitle = styled.h3`
  font-weight: 900;
  margin-bottom: 1rem;
`;

export const AggregationsContainer = styled(Section)`
  padding-top: 0;
`;

export const DimensionListContainer = styled(Section)`
  border-top: 1px solid ${color("border")};
`;
