import PropTypes from "prop-types";
import { Fragment } from "react";

import { Icon } from "metabase/ui";

import type { EditorBreadcrumb } from "../../selectors/data-permissions/breadcrumbs";

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
}: {
  items: EditorBreadcrumb[];
  onBreadcrumbsItemSelect: (item: EditorBreadcrumb) => void;
}) => {
  return (
    <Fragment>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={index}>
            {isLast ? (
              item.text
            ) : (
              <Fragment>
                <BreadcrumbsLink onClick={() => onBreadcrumbsItemSelect(item)}>
                  {item.text}
                </BreadcrumbsLink>
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
