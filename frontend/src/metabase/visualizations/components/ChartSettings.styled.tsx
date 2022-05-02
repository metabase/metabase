import styled from "@emotion/styled";
import Radio from "metabase/core/components/Radio";

export const SectionContainer = styled.div`
  ${Radio.RadioGroupVarients.join(", ")} {
    flex-wrap: wrap;
  }

  ${Radio.RadioContainerVarients.join(", ")} {
    margin-bottom: 0.5rem;
  }
`;
