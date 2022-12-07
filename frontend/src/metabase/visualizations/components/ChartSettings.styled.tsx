import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Radio from "metabase/core/components/Radio";
import Warnings from "metabase/query_builder/components/Warnings";

export const SectionContainer = styled.div`
  ${Radio.RadioGroupVariants.join(", ")} {
    flex-wrap: wrap;
  }

  ${Radio.RadioContainerVariants.join(", ")} {
    margin-bottom: 0.5rem;
  }
`;

export const SectionWarnings = styled(Warnings)`
  color: ${color("accent4")};
`;
