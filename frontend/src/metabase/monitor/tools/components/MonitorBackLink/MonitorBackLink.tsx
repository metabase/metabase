import { Link } from "metabase/common/components/Link";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Flex, Icon } from "metabase/ui";

type MonitorBackLinkProps = {
  to: string;
  label: string;
};

export const MonitorBackLink = ({ to, label }: MonitorBackLinkProps) => (
  <Link to={to}>
    <MonitorHeaderTitle>
      <Flex align="center" gap="xs">
        <Icon name="chevronleft" />
        {label}
      </Flex>
    </MonitorHeaderTitle>
  </Link>
);
