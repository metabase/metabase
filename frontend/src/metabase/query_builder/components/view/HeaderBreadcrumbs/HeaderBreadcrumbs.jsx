import React from "react";
import PropTypes from "prop-types";
import { Container, Divider, HeaderBadge } from "./HeaderBreadcrumbs.styled";

const crumbShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  icon: PropTypes.string,
  href: PropTypes.string,
});

const partPropType = PropTypes.oneOfType([crumbShape, PropTypes.node]);

HeadBreadcrumbs.propTypes = {
  variant: PropTypes.oneOf(["head", "subhead"]),
  parts: PropTypes.arrayOf(partPropType).isRequired,
  divider: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

export function HeadBreadcrumbs({
  variant = "head",
  parts,
  divider,
  ...props
}) {
  return (
    <Container {...props} variant={variant}>
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        return (
          <React.Fragment key={index}>
            {React.isValidElement(part) ? (
              part
            ) : (
              <HeaderBadge to={part.href} icon={part.icon}>
                {part.name}
              </HeaderBadge>
            )}
            {!isLast &&
              (React.isValidElement(divider) ? (
                divider
              ) : (
                <Divider char={divider} />
              ))}
          </React.Fragment>
        );
      })}
    </Container>
  );
}

HeadBreadcrumbs.Badge = HeaderBadge;
