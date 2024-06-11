import { Skeleton, Flex } from "metabase/ui";

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
    <div>
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
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
      </SidebarSection>
      <SidebarSection>
        <SectionTitleSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
        <NavLinkSkeleton />
      </SidebarSection>
      <SidebarSection mt="2rem">
        <NavLinkSkeleton />
      </SidebarSection>
    </div>
  );
}
