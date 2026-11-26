import type { ReactNode } from "react";
import { t } from "ttag";

import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
} from "metabase/common/search/types";
import CS from "metabase/css/core/index.css";
import type { StackProps } from "metabase/ui";
import { Box, Button, FocusTrap, Group, Skeleton, Stack } from "metabase/ui";

import S from "./SearchFilterPopoverWrapper.module.css";

const FILTER_OPTIONS_SKELETON_ROWS = 6;

type SearchFilterPopoverWrapperProps<T extends FilterTypeKeys = any> = {
  children: ReactNode;
  onApply: (value: SearchFilterPropTypes[T]) => void;
  isLoading?: boolean;
} & StackProps;

export const SearchFilterApplyButton = ({
  onApply,
}: Pick<SearchFilterPopoverWrapperProps, "onApply">) => (
  <Button variant="filled" onClick={onApply}>{t`Apply`}</Button>
);

export const SearchFilterPopoverWrapper = ({
  children,
  onApply,
  isLoading = false,
  ...stackProps
}: SearchFilterPopoverWrapperProps) => {
  if (isLoading) {
    return (
      <LoadingSkeleton w="100%" gap={0} {...stackProps}>
        <ListSkeleton rows={FILTER_OPTIONS_SKELETON_ROWS} p="lg" />
        <Box component="hr" className={S.divider} w="100%" />
        <Group justify="flex-end" px="sm" pb="sm">
          <Skeleton h={32} w={64} radius="sm" />
        </Group>
      </LoadingSkeleton>
    );
  }

  return (
    <FocusTrap active>
      <Stack className={CS.overflowHidden} w="100%" gap={0} {...stackProps}>
        {children}
        <Box component="hr" className={S.divider} w="100%" />
        <Group justify="flex-end" align="center" px="sm" pb="sm">
          <SearchFilterApplyButton onApply={onApply} />
        </Group>
      </Stack>
    </FocusTrap>
  );
};
