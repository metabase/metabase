import type { JSX } from "react";

import { Ellipsified, Icon, Text } from "metabase/ui";

import { HomeCard } from "../HomeCard";

import { trackHomeXRayClicked } from "./analytics";

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
    <HomeCard url={url} onClick={trackHomeXRayClicked}>
      <Icon
        name="bolt_filled"
        c="accent4"
        display="block"
        flex="0 0 auto"
        size={20}
      />
      <Ellipsified fz="md" fw="bold" ml="sm" pr="xxs">
        <Text component="span" c="text-secondary">
          {message}
        </Text>{" "}
        <Text component="span" c="text-primary">
          {title}
        </Text>
      </Ellipsified>
    </HomeCard>
  );
};
