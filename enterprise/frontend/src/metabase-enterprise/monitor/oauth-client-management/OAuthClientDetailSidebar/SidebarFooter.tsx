import { t } from "ttag";

import { SidebarFooter as DetailSidebarFooter } from "metabase/monitor/components/DetailSidebar";
import { Button } from "metabase/ui";

import type { SidebarFooterProps } from "./types";

export const SidebarFooter = ({
  client,
  isRevoking,
  onRevokeClient,
}: SidebarFooterProps) => (
  <DetailSidebarFooter>
    <Button disabled={isRevoking} onClick={() => onRevokeClient(client)}>
      {t`Revoke client`}
    </Button>
  </DetailSidebarFooter>
);
