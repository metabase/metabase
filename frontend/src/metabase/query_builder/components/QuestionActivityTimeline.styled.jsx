import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";
import DefaultTimeline from "metabase/components/Timeline";

export const Header = styled.h3`
  margin-bottom: 1rem;
`;

export const Timeline = styled(DefaultTimeline)`
  padding-bottom: 1em;

  ${DefaultTimeline.ItemHeader} {
    display: flex;
    justify-content: space-between;
  }

  ${DefaultTimeline.ItemIcon} {
    // color: ${color("text-dark")};
  }
`;

export const RevertButton = styled(Button)`
  padding: 0;
  border: none;
  color: ${color("text-dark")};
  position: relative;
  top: 2px;

  &:hover {
    background-color: transparent;
    color: ${color("accent3")};
  }
`;

RevertButton.defaultProps = {
  successClassName: "",
  failedClassName: "",
};
