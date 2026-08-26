import { jt, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Anchor, Divider, Text } from "metabase/ui";

export const ForkBoundary = ({ href }: { href?: string | null }) => (
  <Divider
    my="md"
    label={
      <Text span fz="sm" px="md">
        {href
          ? jt`Forked from ${(
              <Anchor
                key="fork-boundary-link"
                component={ForwardRefLink}
                to={href}
                underline="hover"
                fz="sm"
              >
                {t`a previous conversation`}
              </Anchor>
            )}`
          : t`Forked from a previous conversation`}
      </Text>
    }
    labelPosition="center"
    data-testid="metabot-fork-boundary"
  />
);
