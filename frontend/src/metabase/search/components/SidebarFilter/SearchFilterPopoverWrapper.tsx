/* eslint-disable react/prop-types */
import { t } from "ttag";
import {
  DropdownApplyButtonDivider,
  SearchPopoverContainer,
} from "metabase/search/components/SidebarFilter/SidebarFilter.styled";
import { Button, Center, Group, Loader, FocusTrap } from "metabase/ui";

export const SearchFilterPopoverWrapper = ({
  children,
  onApply,
  isLoading = false,
}: {
  children: React.ReactNode;
  onApply: () => void;
  isLoading?: boolean;
}) => {
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
          <Button onClick={onApply}>{t`Apply filters`}</Button>
        </Group>
      </SearchPopoverContainer>
    </FocusTrap>
  );
};
