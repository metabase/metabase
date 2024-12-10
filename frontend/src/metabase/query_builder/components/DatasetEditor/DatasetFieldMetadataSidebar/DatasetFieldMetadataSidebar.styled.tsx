import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";
import SelectButton from "metabase/core/components/SelectButton";

export const FormContainer = styled.div`
  ${Radio.RadioGroupVariants.join(", ")} {
    color: var(--mb-color-text-dark);
  }

  ${SelectButton.Root} {
    color: var(--mb-color-text-dark);
    transition: border 0.3s;
    outline: none;
  }

  ${SelectButton.Root}:focus {
    border-color: var(--mb-color-brand);
  }
`;
