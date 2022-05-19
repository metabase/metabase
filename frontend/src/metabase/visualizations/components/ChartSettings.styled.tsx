import styled from "@emotion/styled";
import Radio from "metabase/core/components/Radio";

export const SectionContainer = styled.div`
  ${Radio.RadioGroupVariants.join(", ")} {
    flex-wrap: wrap;
  }

  ${Radio.RadioContainerVariants.join(", ")} {
    margin-bottom: 0.5rem;
  }
`;
