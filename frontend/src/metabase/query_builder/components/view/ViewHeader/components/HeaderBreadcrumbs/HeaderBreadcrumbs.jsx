import cx from "classnames";
import PropTypes from "prop-types";
import { Fragment, isValidElement } from "react";

import { Badge } from "metabase/components/Badge";
import { Flex, Text } from "metabase/ui";

import HeaderBreadcrumbsS from "./HeaderBreadcrumbs.module.css";

const HeaderBadge = props => (
  <Badge className={HeaderBreadcrumbsS.HeaderBadge} {...props} />
);

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
              <Badge
                className={cx(HeaderBreadcrumbsS.HeaderBadge, {
                  [HeaderBreadcrumbsS.headVariant]: variant === "head",
                })}
                to={part.href}
                icon={part.icon}
                inactiveColor={badgeInactiveColor}
              >
                {part.name}
              </Badge>
            )}
            {!isLast &&
              (isValidElement(divider) ? divider : <Divider char={divider} />)}
          </Fragment>
        );
      })}
    </Flex>
  );
}

// eslint-disable-next-line react/prop-types
function Divider({ char = "/" }) {
  return (
    <Text component="span" className={HeaderBreadcrumbsS.HeaderBreadcrumbs}>
      {char}
    </Text>
  );
}

HeadBreadcrumbs.Badge = HeaderBadge;
// TODO: likely not used and can be removed
HeadBreadcrumbs.Divider = Divider;
