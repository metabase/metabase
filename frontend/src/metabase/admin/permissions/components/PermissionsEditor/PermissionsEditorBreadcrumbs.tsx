import { Fragment } from "react";

import { Icon, Text } from "metabase/ui";

import type { PermissionEditorBreadcrumb } from "../../types";

import {
  BreadcrumbsLink,
  BreadcrumbsSeparator,
} from "./PermissionsEditorBreadcrumbs.styled";

export interface PermissionsEditorBreadcrumbsProps {
  breadcrumbs: PermissionEditorBreadcrumb[];
  onBreadcrumbsItemSelect: (item: PermissionEditorBreadcrumb) => void;
}

export const PermissionsEditorBreadcrumbs = ({
  breadcrumbs,
  onBreadcrumbsItemSelect,
}: PermissionsEditorBreadcrumbsProps) => {
  return (
    <Fragment>
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;
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
