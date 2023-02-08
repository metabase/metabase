import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Radio from "metabase/core/components/Radio";
import Button from "metabase/core/components/Button";
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

export const TitleButton = styled(Button)`
  margin-left: 1.5rem;
  margin-bottom: 0.5rem;
  ${Button.Content} {
    color: ${color("text-dark")};
    &:hover {
      color: ${color("brand")};
    }

    font-size: 1rem;
  }
`;
