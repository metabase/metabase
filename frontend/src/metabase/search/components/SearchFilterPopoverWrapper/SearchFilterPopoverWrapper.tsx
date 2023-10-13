import { t } from "ttag";
import type { ReactNode } from "react";
import { Button, Center, Group, Loader, FocusTrap } from "metabase/ui";
import type {
  FilterTypeKeys,
  SearchFilterPropTypes,
} from "metabase/search/types";
import {
  DropdownApplyButtonDivider,
  SearchPopoverContainer,
} from "./SearchFilterPopoverWrapper.styled";

type SearchFilterPopoverWrapperProps<T extends FilterTypeKeys = any> = {
  children: ReactNode;
  onApply: (value: SearchFilterPropTypes[T]) => void;
  isLoading?: boolean;
};

export const SearchFilterApplyButton = ({
  onApply,
}: Pick<SearchFilterPopoverWrapperProps, "onApply">) => (
  <Button onClick={onApply}>{t`Apply`}</Button>
);

export const SearchFilterPopoverWrapper = ({
  children,
  onApply,
  isLoading = false,
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
      <SearchPopoverContainer spacing={0}>
        {children}
        <DropdownApplyButtonDivider />
        <Group position="right" align="center" px="sm" pb="sm">
          <SearchFilterApplyButton onApply={onApply} />
        </Group>
      </SearchPopoverContainer>
    </FocusTrap>
  );
};
