import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ActionButton from "metabase/components/ActionButton";
import DefaultTimeline from "metabase/components/Timeline";

export const Timeline = styled(DefaultTimeline)`
  padding-bottom: 1em;
`;

export const RevertButton = styled(ActionButton)`
  padding: 0;
  border: none;
  color: ${color("text-dark")};
  font-size: 0.875em;

  &:hover {
    background-color: transparent;
    color: ${color("accent3")};
  }
`;

RevertButton.defaultProps = {
  successClassName: "",
  failedClassName: "",
};
