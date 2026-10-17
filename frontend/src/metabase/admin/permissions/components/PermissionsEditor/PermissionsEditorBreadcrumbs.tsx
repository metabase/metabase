import { Fragment } from "react";

import { Box, Icon, Text } from "metabase/ui";

import type { PermissionEditorBreadcrumb } from "../../types";

import S from "./PermissionsEditorBreadcrumbs.module.css";

export interface PermissionsEditorBreadcrumbsProps {
  items: PermissionEditorBreadcrumb[];
  onBreadcrumbsItemSelect: (item: PermissionEditorBreadcrumb) => void;
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
                <Box
                  component="a"
                  className={S.link}
                  onClick={() => onBreadcrumbsItemSelect(item)}
                >
                  {item.text}
                </Box>
                {subtext ? <> {subtext}</> : null}
                <Box
                  display="inline-block"
                  c="background_page-tertiary-inverse"
                  pos="relative"
                  mx="xs"
                  top={2}
                >
                  <Icon name="chevronright" />
                </Box>
              </Fragment>
            )}
          </Fragment>
        );
      })}
    </Fragment>
  );
};
