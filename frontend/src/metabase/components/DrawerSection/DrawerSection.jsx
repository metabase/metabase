import React, { useState } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import {
  Container,
  Transformer,
  Children,
  Header,
} from "./DrawerSection.styled";

DrawerSection.propTypes = {
  header: PropTypes.node.isRequired,
  children: PropTypes.node,
  initialState: PropTypes.oneOf(["closed", "open"]),
};

function DrawerSection({ header, children, initialState = "closed" }) {
  const [isOpen, setIsOpen] = useState(initialState === "open");

  return (
    <Container isOpen={isOpen}>
      <Transformer isOpen={isOpen}>
        <Header
          isOpen={isOpen}
          onClick={() => setIsOpen(isOpen => !isOpen)}
          onKeyDown={e => e.key === "Enter" && setIsOpen(isOpen => !isOpen)}
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
