import cx from "classnames";
import type { PropsWithChildren } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Card } from "metabase/common/components/Card";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, type IconName, Title, Tooltip } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { RelatedDashboardXRays } from "metabase-types/api";

import S from "./AutomaticDashboardApp.module.css";
import { trackSuggestedXRayClicked } from "./analytics";

const RELATED_CONTENT: Record<
  keyof RelatedDashboardXRays,
  { title: string; icon: IconName }
> = {
  compare: {
    get title() {
      return t`Compare`;
    },
    icon: "compare",
  },
  "zoom-in": {
    get title() {
      return t`Zoom in`;
    },
    icon: "zoom_in",
  },
  "zoom-out": {
    get title() {
      return t`Zoom out`;
    },
    icon: "zoom_out",
  },
  related: {
    get title() {
      return t`Related`;
    },
    icon: "connections",
  },
} as const;

const SuggestionsList = ({
  suggestions,
}: {
  suggestions: RelatedDashboardXRays;
}) => (
  <Box component="ol" my="sm">
    {_.keys(suggestions).map((s, index) => {
      const suggestionKey = s as keyof RelatedDashboardXRays;
      const suggestionItem = suggestions[suggestionKey];
      return (
        <li key={index} className={CS.my2}>
          <SuggestionSectionHeading>
            {RELATED_CONTENT[suggestionKey].title}
          </SuggestionSectionHeading>
          {suggestionItem &&
            Array.isArray(suggestionItem) &&
            suggestionItem.length > 0 &&
            suggestionItem.map((item, itemIndex) => (
              <Link
                key={itemIndex}
                to={item.url}
                className={cx(CS.hoverParent, CS.hoverVisibility, S.ItemLink)}
                onClick={() => trackSuggestedXRayClicked(suggestionKey)}
              >
                <Card className={CS.p2} hoverable>
                  <Flex align="center">
                    <Icon
                      name={RELATED_CONTENT[suggestionKey].icon}
                      c="accent4"
                      className={CS.mr1}
                    />
                    <h4 className={CS.textWrap}>{item.title}</h4>
                    <Box ml="auto" className={CS.hoverChild}>
                      <Tooltip label={item.description}>
                        <Icon
                          name="info_outline"
                          c="background-tertiary-inverse"
                        />
                      </Tooltip>
                    </Box>
                  </Flex>
                </Card>
              </Link>
            ))}
        </li>
      );
    })}
  </Box>
);

const SuggestionSectionHeading = ({ children }: PropsWithChildren) => (
  <h5
    style={{
      fontWeight: 900,
      textTransform: "uppercase",
      color: color("text-secondary"),
    }}
    className={CS.mb1}
  >
    {children}
  </h5>
);

export const SuggestionsSidebar = ({
  related,
}: {
  related: RelatedDashboardXRays;
}) => (
  <Flex direction="column" py="md" px="xl" role="complementary">
    <Title py="sm" px={0} order={2}>{t`More X-rays`}</Title>
    <SuggestionsList suggestions={related} />
  </Flex>
);
