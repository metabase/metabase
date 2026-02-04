import { Fragment } from "react";

import { Icon, Text } from "metabase/ui";

import {
  BreadcrumbsLink,
  BreadcrumbsSeparator,
} from "./PermissionsEditorBreadcrumbs.styled";

export interface BreadcrumbItem {
  text: string;
  subtext?: string;
}

interface PermissionsEditorBreadcrumbsProps {
  items: BreadcrumbItem[];
  onBreadcrumbsItemSelect: (item: BreadcrumbItem) => void;
}

export const PermissionsEditorBreadcrumbs = ({
  items,
  onBreadcrumbsItemSelect,
}: PermissionsEditorBreadcrumbsProps) => {
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
