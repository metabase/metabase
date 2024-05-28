import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";
import { color } from "metabase/lib/colors";

interface PopoverRootProps {
  noTopPadding: boolean;
}

export const PopoverRoot = styled.div<PopoverRootProps>`
  padding: 1.5rem 0 1rem;
  overflow-y: auto;
  max-height: 600px;
  min-width: 336px;

  ${({ noTopPadding }) => noTopPadding && "padding-top: 0;"}
`;

export const PopoverTabs = styled(Radio)`
  padding: 0;
  border-bottom: 1px solid ${color("border")};
  margin: 0 1rem 1rem 1rem;

  ${Radio.RadioLabelVariants.join(", ")} {
    flex: 1 0 0;
    text-transform: capitalize;
    margin-right: 0;
  }

  ${Radio.RadioContainerVariants.join(", ")} {
    justify-content: center;
    padding-bottom: 0.75rem;
  }

  ${Radio.RadioLabelText} {
    flex: none;
  }
`;

export const PopoverTitle = styled.h3`
  margin-left: 2rem;
  margin-right: 2rem;
  margin-bottom: 1.5rem;
`;
