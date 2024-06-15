import { Skeleton, Flex } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";

import { SidebarSection } from "./MainNavbar.styled";

const NavLinkSkeleton = () => (
  <Flex my="1rem" gap="sm" px="1rem">
    <Skeleton radius="100%" w="1rem" h="1rem" />
    <Skeleton h="1rem" natural />
  </Flex>
);

const SectionTitleSkeleton = () => (
  <Skeleton
    h=".75rem"
    mt="2rem"
    mb="1rem"
    w="8rem"
    style={{ marginInlineStart: "1rem" }}
  />
);

export function NavbarLoadingView() {
  return (
    <div aria-busy data-testid="loading-spinner">
      <SidebarSection>
        <NavLinkSkeleton />
      </SidebarSection>
      <SidebarSection>
        <SectionTitleSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
      </SidebarSection>
      <SidebarSection>
        <SectionTitleSkeleton />
        <Repeat times={3}>
          <NavLinkSkeleton />
        </Repeat>
      </SidebarSection>
      <SidebarSection>
        <SectionTitleSkeleton />
        <Repeat times={7}>
          <NavLinkSkeleton />
        </Repeat>
      </SidebarSection>
    </div>
  );
}
