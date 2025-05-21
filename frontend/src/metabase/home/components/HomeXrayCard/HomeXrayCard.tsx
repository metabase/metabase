import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { Box, Group, Icon, Text } from "metabase/ui";

import { HomeCard } from "../HomeCard";

interface HomeXrayCardProps {
  title: string;
  url: string;
  message: string;
}

export const HomeXrayCard = ({
  title,
  url,
  message,
}: HomeXrayCardProps): JSX.Element => {
  return (
    <HomeCard url={url}>
      <Icon name="bolt_filled" c={color("accent4")} w="1.5rem" h="1.25rem" />
      <Box
        component={Ellipsified}
        tooltip={[message, title].join(" ")}
        fz="1rem"
        fw="bold"
        ms="md"
        pe=".2rem"
      >
        <Group gap={0}>
          <Text c="text-medium">{message}</Text>
          <Text>&nbsp;</Text>
          <Text c="text-dark">{title}</Text>
        </Group>
      </Box>
    </HomeCard>
  );
};
