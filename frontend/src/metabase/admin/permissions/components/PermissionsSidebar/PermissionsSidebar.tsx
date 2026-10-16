import cx from "classnames";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";

import S from "./PermissionsSidebar.module.css";
import type { PermissionsSidebarContentProps } from "./PermissionsSidebarContent";
import { PermissionsSidebarContent } from "./PermissionsSidebarContent";

interface PermissionsSidebarProps extends PermissionsSidebarContentProps {
  isLoading?: boolean;
  error?: string;
}

export const PermissionsSidebar = ({
  isLoading,
  error,
  ...contentProps
}: PermissionsSidebarProps) => {
  return (
    <Flex
      component="aside"
      className={cx(S.borderRight, CS.overflowHidden)}
      direction="column"
      flex="0 0 auto"
      w="18.75rem"
    >
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <PermissionsSidebarContent {...contentProps} />
      </LoadingAndErrorWrapper>
    </Flex>
  );
};
