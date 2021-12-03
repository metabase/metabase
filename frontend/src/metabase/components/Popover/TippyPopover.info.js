import React from "react";
import styled from "styled-components";

import { forwardRefToInnerRef } from "metabase/styled-components/utils";

import TippyPopover from "./TippyPopover";

export const component = TippyPopover;
export const description = "Wrapper around react-popper";

const Base = styled.div`
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PopoverBody = forwardRefToInnerRef(styled(Base)`
  border: none;
  height: 200px;
  width: 200px;
`);

const LazyPopoverBody = forwardRefToInnerRef(styled(Base)`
  border: none;
  height: 200px;
  width: 200px;
  transition: opacity 1s;
  opacity: ${props => props.opacity};
`);

const PopoverTarget = forwardRefToInnerRef(styled(Base)`
  height: 100px;
  width: 100px;
`);

const content = <PopoverBody>popover body</PopoverBody>;
const target = <PopoverTarget>popover target</PopoverTarget>;

function LazyContentExample() {
  const [opacity, setOpacity] = React.useState(0.1);
  const timeout = React.useRef();

  React.useEffect(() => {
    timeout.current = setTimeout(() => {
      setOpacity(1);
    }, 1000);

    return () => {
      clearTimeout(timeout.current);
    };
  }, [opacity]);

  return <LazyPopoverBody opacity={opacity}>popover content</LazyPopoverBody>;
}

export const examples = {
  "vertical placement": (
    <TippyPopover placement="top-start" content={content}>
      {target}
    </TippyPopover>
  ),
  "horizontal placement": (
    <TippyPopover placement="left-end" content={content}>
      {target}
    </TippyPopover>
  ),
  "lazy content rendering": (
    <React.Fragment>
      <TippyPopover placement="left-end" content={<LazyContentExample />}>
        <PopoverTarget>lazy target</PopoverTarget>
      </TippyPopover>
      <TippyPopover
        lazy={false}
        placement="left-end"
        content={<LazyContentExample />}
      >
        <PopoverTarget>not lazy target</PopoverTarget>
      </TippyPopover>
    </React.Fragment>
  ),
  interactive: (
    <TippyPopover interactive placement="left-end" content={content}>
      {target}
    </TippyPopover>
  ),
};
