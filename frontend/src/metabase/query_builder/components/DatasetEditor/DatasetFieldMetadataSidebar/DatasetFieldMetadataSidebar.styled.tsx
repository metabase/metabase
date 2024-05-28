import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";
import SelectButton from "metabase/core/components/SelectButton";
import { color } from "metabase/lib/colors";

const CONTENT_PADDING = "24px";

const FormContainer = styled.div`
  ${Radio.RadioGroupVariants.join(", ")} {
    color: ${color("text-dark")};
  }

  ${SelectButton.Root} {
    color: ${color("text-dark")};
    transition: border 0.3s;
    outline: none;
  }

  ${SelectButton.Root}:focus {
    border-color: ${color("brand")};
  }
`;

export const MainFormContainer = styled(FormContainer)`
  padding: ${CONTENT_PADDING} ${CONTENT_PADDING} 0 ${CONTENT_PADDING};
`;

export const SecondaryFormContainer = styled(FormContainer)`
  padding: 0 ${CONTENT_PADDING} ${CONTENT_PADDING} ${CONTENT_PADDING};
`;

export const ViewAsFieldContainer = styled.div`
  font-weight: bold;
`;

export const FormTabsContainer = styled.div`
  padding-left: ${CONTENT_PADDING};
  padding-right: ${CONTENT_PADDING};
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: ${color("bg-medium")};
`;
