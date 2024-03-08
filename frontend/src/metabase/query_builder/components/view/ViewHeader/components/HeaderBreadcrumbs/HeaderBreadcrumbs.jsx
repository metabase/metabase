import PropTypes from "prop-types";
import { isValidElement, Fragment } from "react";

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
  inactiveColor: PropTypes.string,
  divider: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

function getBadgeInactiveColor({ variant, isLast }) {
  return isLast && variant === "head" ? "text-dark" : "text-light";
}

export function HeadBreadcrumbs({
  variant = "head",
  parts,
  divider,
  inactiveColor,
  ...props
}) {
  return (
    <Container data-testid="head-crumbs-container" {...props} variant={variant}>
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        const badgeInactiveColor =
          inactiveColor || getBadgeInactiveColor({ variant, isLast });
        return (
          <Fragment key={index}>
            {isValidElement(part) ? (
              part
            ) : (
              <HeaderBadge
                to={part.href}
                icon={part.icon}
                inactiveColor={badgeInactiveColor}
              >
                {part.name}
              </HeaderBadge>
            )}
            {!isLast &&
              (isValidElement(divider) ? divider : <Divider char={divider} />)}
          </Fragment>
        );
      })}
    </Container>
  );
}

HeadBreadcrumbs.Badge = HeaderBadge;
HeadBreadcrumbs.Divider = Divider;
