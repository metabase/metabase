import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import {
  Container,
  Transformer,
  Children,
  Header,
} from "./DrawerSection.styled";

export const STATES = {
  closed: "closed",
  open: "open",
};

DrawerSection.propTypes = {
  header: PropTypes.node.isRequired,
  children: PropTypes.node,
  state: PropTypes.oneOf([STATES.closed, STATES.open]),
  onStateChange: PropTypes.func,
};

function DrawerSection({ header, children, state, onStateChange }) {
  return _.isFunction(onStateChange) ? (
    <ControlledDrawerSection
      header={header}
      state={state}
      onStateChange={onStateChange}
    >
      {children}
    </ControlledDrawerSection>
  ) : (
    <UncontrolledDrawerSection header={header} initialState={state}>
      {children}
    </UncontrolledDrawerSection>
  );
}

UncontrolledDrawerSection.propTypes = {
  header: PropTypes.node.isRequired,
  children: PropTypes.node,
  initialState: PropTypes.oneOf([STATES.closed, STATES.open]),
};

function UncontrolledDrawerSection({ header, children, initialState }) {
  const [state, setState] = useState(initialState);

  return (
    <ControlledDrawerSection
      header={header}
      state={state}
      onStateChange={setState}
    >
      {children}
    </ControlledDrawerSection>
  );
}

ControlledDrawerSection.propTypes = {
  header: PropTypes.node.isRequired,
  children: PropTypes.node,
  state: PropTypes.oneOf([STATES.closed, STATES.open]),
  onStateChange: PropTypes.func.isRequired,
};

function ControlledDrawerSection({ header, children, state, onStateChange }) {
  const isOpen = state === STATES.open;

  const toggleState = () => {
    if (state === STATES.open) {
      onStateChange(STATES.closed);
    } else {
      onStateChange(STATES.open);
    }
  };

  return (
    <Container isOpen={isOpen}>
      <Transformer isOpen={isOpen}>
        <Header
          isOpen={isOpen}
          onClick={toggleState}
          onKeyDown={e => e.key === "Enter" && toggleState()}
        >
          {header}
          <Icon
            className="mr1"
            name={isOpen ? "chevrondown" : "chevronup"}
            size={12}
          />
        </Header>
        <Children isOpen={isOpen}>{children}</Children>
      </Transformer>
    </Container>
  );
}

export default DrawerSection;
