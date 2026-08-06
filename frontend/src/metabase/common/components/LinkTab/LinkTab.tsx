import type { FC } from "react";

import { Link } from "metabase/common/components/Link";
import { Tabs, type TabsTabProps } from "metabase/ui";

/**
 * Mantine's `Tabs.Tab` is built with the non-polymorphic `factory`, so
 * `component`/`to` aren't in its prop types. However it still accepts the
 * prop and it works as expected, thus type casting.
 */
const TabsTabAsLink = Tabs.Tab as FC<
  TabsTabProps & { component: typeof Link; to: string }
>;

type LinkTabProps = TabsTabProps & {
  to: string;
};

/**
 * Mantine tab that navigates as a react-router link.
 */
export function LinkTab(props: LinkTabProps) {
  return <TabsTabAsLink {...props} component={Link} />;
}
