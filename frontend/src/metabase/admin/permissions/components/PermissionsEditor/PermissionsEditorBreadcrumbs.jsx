import PropTypes from "prop-types";
import { Fragment } from "react";

import { Icon, Text } from "metabase/ui";

import {
  BreadcrumbsLink,
  BreadcrumbsSeparator,
} from "./PermissionsEditorBreadcrumbs.styled";

const propTypes = {
  items: PropTypes.array,
  onBreadcrumbsItemSelect: PropTypes.func,
};

export const PermissionsEditorBreadcrumbs = ({
  items,
  onBreadcrumbsItemSelect,
}) => {
  return (
    <Fragment>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const subtext = item.subtext ? (
          <Text display="inline-block" c="text-secondary" fw="500" fz="1em">
            {item.subtext}
          </Text>
        ) : null;

        return (
          <Fragment key={index}>
            {isLast ? (
              <>
                {item.text} {subtext}
              </>
            ) : (
              <Fragment>
                <>
                  <BreadcrumbsLink
                    onClick={() => onBreadcrumbsItemSelect(item)}
                  >
                    {item.text}
                  </BreadcrumbsLink>
                  {subtext ? <> {subtext}</> : null}
                </>
                <BreadcrumbsSeparator>
                  <Icon name="chevronright" />
                </BreadcrumbsSeparator>
              </Fragment>
            )}
          </Fragment>
        );
      })}
    </Fragment>
  );
};

PermissionsEditorBreadcrumbs.propTypes = propTypes;
