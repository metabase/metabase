import React from "react";
import styled from "@emotion/styled";

import TippyPopover from "./TippyPopover";

export const component = TippyPopover;
export const description = "Wrapper around react-popper";

const Base = styled.div`
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PopoverBody = styled(Base)`
  border: none;
  height: 200px;
  width: 200px;
`;

const LongPopoverBody = styled(PopoverBody)`
  height: 600px;
`;

const LazyPopoverBody = styled(Base)`
  border: none;
  height: 200px;
  width: 200px;
  transition: opacity 1s;
  opacity: ${props => props.opacity};
`;

const PopoverTarget = styled(Base)`
  height: 100px;
  width: 100px;
`;

const content = <PopoverBody>popover body</PopoverBody>;
const longContent = <LongPopoverBody>long popover body</LongPopoverBody>;
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

function VisiblePropExample() {
  const [visible, setVisible] = React.useState(true);
  return (
    <TippyPopover
      visible={visible}
      onHide={() => {
        setVisible(false);
      }}
      placement="left-end"
      content={content}
    >
      <div onClick={() => setVisible(true)}>{target}</div>
    </TippyPopover>
  );
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
  "interactive disabled": (
    <TippyPopover interactive={false} placement="left-end" content={content}>
      {target}
    </TippyPopover>
  ),
  "control mode + handling of Esc press": <VisiblePropExample />,
  "flip disabled": (
    <TippyPopover flip={false} placement="bottom-start" content={content}>
      {target}
    </TippyPopover>
  ),
  sizeToFit: (
    <TippyPopover
      sizeToFit
      placement="bottom-start"
      visible
      content={longContent}
    >
      {target}
    </TippyPopover>
  ),
  extra_space: <div style={{ height: 250 }} />,
};
