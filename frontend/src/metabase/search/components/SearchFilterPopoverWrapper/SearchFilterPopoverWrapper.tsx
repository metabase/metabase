import type { ReactNode } from "react";
import { t } from "ttag";

import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
} from "metabase/search/types";
import type { StackProps } from "metabase/ui";
import { Button, Center, Group, Loader, FocusTrap } from "metabase/ui";

import {
  DropdownApplyButtonDivider,
  SearchPopoverContainer,
} from "./SearchFilterPopoverWrapper.styled";

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
      <Center p="lg">
        <Loader data-testid="loading-spinner" />
      </Center>
    );
  }

  return (
    <FocusTrap active>
      <SearchPopoverContainer spacing={0} {...stackProps}>
        {children}
        <DropdownApplyButtonDivider />
        <Group position="right" align="center" px="sm" pb="sm">
          <SearchFilterApplyButton onApply={onApply} />
        </Group>
      </SearchPopoverContainer>
    </FocusTrap>
  );
};
