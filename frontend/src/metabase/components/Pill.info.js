import React from "react";
import { Pill, PillWithAdornment } from "metabase/components/Pill";
import Icon from "metabase/components/Icon";

export const component = Pill;

export const description = `
Always take your pills
`;

export const examples = {
  default: <Pill>Hey its a pill</Pill>,
  withLeft: (
    <PillWithAdornment left={<Icon name="person" color="white" />}>
      Its a pill with a left attachment
    </PillWithAdornment>
  ),
  withRight: (
    <PillWithAdornment right={<Icon name="close" color="white" />}>
      Its a pill with a left attachment
    </PillWithAdornment>
  ),
  withBoth: (
    <PillWithAdornment
      py={2}
      left={<Icon name="folder" />}
      right={<Icon name="close" />}
    >
      Its a pill with all the things
    </PillWithAdornment>
  ),
};
