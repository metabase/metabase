import React from "react";
import PropTypes from "prop-types";
import {
  Container,
  Divider,
  TitleOrLink,
  SubHeadContainer,
  SubHeadBadge,
} from "./HeaderBreadcrumbs.styled";

const crumbShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  icon: PropTypes.string,
  href: PropTypes.string,
});

HeadBreadcrumbs.propTypes = {
  parts: PropTypes.arrayOf(crumbShape).isRequired,
};

export function HeadBreadcrumbs({ parts, ...props }) {
  return (
    <Container {...props}>
      {parts.map(({ name, href }, index) => (
        <React.Fragment key={index}>
          <TitleOrLink to={href}>{name}</TitleOrLink>
          {index < parts.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </Container>
  );
}

SubHeadBreadcrumbs.propTypes = {
  parts: PropTypes.arrayOf(crumbShape).isRequired,
};

export function SubHeadBreadcrumbs({ parts, ...props }) {
  return (
    <span {...props}>
      <SubHeadContainer>
        {parts.map(({ name, icon, href }, index) => (
          <SubHeadBadge key={index} icon={{ name: icon }} to={href}>
            {name}
          </SubHeadBadge>
        ))}
      </SubHeadContainer>
    </span>
  );
}
