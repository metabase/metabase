import cx from "classnames";
import PropTypes from "prop-types";
import { Fragment, isValidElement } from "react";

import { Badge } from "metabase/components/Badge";
import { Box, Flex } from "metabase/ui";

import HeaderBreadcrumbsS from "./HeaderBreadcrumbs.module.css";

const HeaderBadge = props => (
  <Badge className={HeaderBreadcrumbsS.HeaderBadge} {...props} />
);

HeaderBadge.propTypes = {
  variant: PropTypes.oneOf(["head", "subhead"]),
  children: PropTypes.node,
  icon: PropTypes.string,
  to: PropTypes.string,
  inactiveColor: PropTypes.string,
};

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
  inactiveColor = undefined,
  ...props
}) {
  return (
    <Flex
      align="center"
      wrap="wrap"
      data-testid="head-crumbs-container"
      className={cx(HeaderBreadcrumbsS.Container, {
        [HeaderBreadcrumbsS.headVariant]: variant === "head",
      })}
      {...props}
    >
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
    </Flex>
  );
}

Divider.propTypes = {
  char: PropTypes.string,
};

function Divider({ char = "/" }) {
  return (
    <Box component="span" className={HeaderBreadcrumbsS.HeaderBreadcrumbs}>
      {char}
    </Box>
  );
}

HeadBreadcrumbs.Badge = HeaderBadge;
