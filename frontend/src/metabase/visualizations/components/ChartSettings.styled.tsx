import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Radio from "metabase/core/components/Radio";
import Button from "metabase/core/components/Button";
import Warnings from "metabase/query_builder/components/Warnings";

export const SectionContainer = styled.div`
  ${({ isDashboard }) =>
    isDashboard &&
    css`
      margin-top: 1rem;
    `}
  width: 100%;
  ${Radio.RadioGroupVariants.join(", ")} {
    border-bottom: 1px solid ${color("border")};
  }
  ${Radio.RadioContainerVariants.join(", ")} {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  ${Radio.RadioLabelVariants.join(", ")} {
    flex-grow: 1;
    margin-right: 0;
    display: flex;
    justify-content: center;
    &:not(:last-child) {
      margin-right: 0;
    }
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
