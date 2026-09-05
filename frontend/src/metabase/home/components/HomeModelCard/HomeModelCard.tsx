import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { IconData } from "metabase/common/utils/icon";
import { Box, Ellipsified } from "metabase/ui";

import { HomeCard } from "../HomeCard";

interface HomeModelCardProps {
  title: string;
  icon: IconData;
  url: string;
}

export const HomeModelCard = ({
  title,
  icon,
  url,
}: HomeModelCardProps): JSX.Element => {
  return (
    <HomeCard url={url}>
      <Box display="flex" flex="0 0 auto">
        <EntityIcon {...icon} color="core-brand" />
      </Box>
      <Ellipsified c="text-primary" fz="md" fw="bold" ml="lg" maw="100%">
        {title}
      </Ellipsified>
    </HomeCard>
  );
};
