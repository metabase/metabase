import React from "react";
import PropTypes from "prop-types";
import { Container, Divider, HeaderBadge } from "./HeaderBreadcrumbs.styled";

const crumbShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  icon: PropTypes.string,
  href: PropTypes.string,
});

HeadBreadcrumbs.propTypes = {
  variant: PropTypes.oneOf(["head", "subhead"]),
  parts: PropTypes.arrayOf(crumbShape).isRequired,
};

export function HeadBreadcrumbs({ variant = "head", parts, ...props }) {
  return (
    <Container {...props} variant={variant}>
      {parts.map((part, index) => {
        const { name, icon, href } = part;
        const isLast = index === parts.length - 1;
        const inactiveColor =
          isLast && variant === "head" ? "text-dark" : "text-light";
        return (
          <React.Fragment key={index}>
            <HeaderBadge to={href} icon={icon} inactiveColor={inactiveColor}>
              {name}
            </HeaderBadge>
            {!isLast && <Divider />}
          </React.Fragment>
        );
      })}
    </Container>
  );
}
