/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { jt, t } from "ttag";

import Link from "metabase/core/components/Link";
import { useCollectionListQuery } from "metabase/common/hooks";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import fitViewport from "metabase/hoc/FitViewPort";
import { Icon, Flex, Box } from "metabase/ui";

import SidebarLayout from "../components/SidebarLayoutFixedWidth";
import { AuditSidebar } from "../components/AuditSidebar";
import { DeprecationNotice } from "./AuditApp.styled";

const Layout = fitViewport(SidebarLayout);

const DeprecationSection = () => {
  const { data: collections } = useCollectionListQuery();

  const auditCollection = useMemo(
    () => collections?.find?.(isInstanceAnalyticsCollection),
    [collections],
  );

  if (!auditCollection) {
    return null;
  }

  return (
    <DeprecationNotice>
      <Flex align="center" px="xl" py="md">
        <Icon name="info_filled" />
        <Box pl="sm">
          <Box>
            {jt`This Audit section has been upgraded to the
              ${(
                <Link
                  variant="brandBold"
                  key="link"
                  to={`/collection/${auditCollection.id}`}
                >
                  {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
                  {t`Metabase Analytics Collection`}
                </Link>
              )}
               and will be removed in a future release.`}
          </Box>
          <Box>
            {jt`It's now easier to explore and to give others
              ${(
                <Link
                  variant="brandBold"
                  key="link"
                  to={`/admin/permissions/collections/${auditCollection.id}`}
                >
                  {t`access`}
                </Link>
              )}
            to these insights.`}
          </Box>
        </Box>
      </Flex>
    </DeprecationNotice>
  );
};

const AuditApp = ({ children }) => (
  <>
    <DeprecationSection />
    <Layout sidebar={<AuditSidebar />}>
      <div>{children}</div>
    </Layout>
  </>
);

export default AuditApp;
