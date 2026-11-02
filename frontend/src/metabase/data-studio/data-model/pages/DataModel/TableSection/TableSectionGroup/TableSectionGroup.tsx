import { SidebarSection } from "metabase/common/components/DetailSidebar";
import { Stack } from "metabase/ui";

import S from "../TableSection.module.css";

export function TableSectionGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const content = (
    <Stack gap="lg" className={S.box}>
      {children}
    </Stack>
  );

  return title ? (
    <SidebarSection title={title}>{content}</SidebarSection>
  ) : (
    content
  );
}
