import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";

import Form from "metabase/containers/Form";

export const StyledForm = styled(Form)`
  ${Radio.RadioGroupVariants.join(", ")} {
    flex-wrap: wrap;
    gap: 0.5rem 0;
  }
`;
