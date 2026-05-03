import cx from "classnames";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink/ExternalLink";
import { useLearnUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Button, HoverCard, Icon, Text, Transition } from "metabase/ui";
import { duration } from "metabase/utils/formatting";
import type { LoadingViewProps } from "metabase/visualizations/components/Visualization/LoadingView/LoadingView";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { CardDisplayType } from "metabase-types/api";

export const DashCardLoadingView = ({
  isSlow,
  expectedDuration,
  display,
}: LoadingViewProps & { display?: CardDisplayType }) => {
  const { url, showMetabaseLinks } = useLearnUrl(
    "metabase-basics/administration/administration-and-operation/making-dashboards-faster",
  );
  const getPreamble = () => {
    if (isSlow === "usually-fast") {
      return t`This usually loads immediately, but is currently taking longer.`;
    }
    if (expectedDuration) {
      return jt`This usually takes around ${(
        <span key="duration" className={CS.textNoWrap}>
          {duration(expectedDuration)}
        </span>
      )}.`;
    }
  };

  return (
    <div
      data-testid="loading-indicator"
      className={cx(CS.px2, CS.pb2, CS.fullHeight)}
    >
      <ChartSkeleton display={display} />
      <Transition
        mounted={!!isSlow}
        transition={{
          in: { opacity: 1, transform: "scale(1)" },
          out: { opacity: 0, transform: "scale(0.8)" },
          transitionProperty: "transform, opacity",
        }}
        duration={80}
      >
        {(styles) => (
          <Box style={styles} className={CS.absolute} left={12} bottom={12}>
            <HoverCard width={288} offset={4} position="bottom-start">
              <HoverCard.Target>
                <Button w={24} h={24} p={0} classNames={{ label: cx(CS.flex) }}>
                  <Icon name="snail" size={12} d="flex" />
                </Button>
              </HoverCard.Target>
              <HoverCard.Dropdown ml={-8}>
                <div className={cx(CS.p2, CS.textCentered)}>
                  <Text fw="bold">{t`Waiting for your data`}</Text>
                  <Text lh="1.5" mt={4}>
                    {getPreamble()}{" "}
                    {t`You can use caching to speed up question loading.`}
                  </Text>
                  {showMetabaseLinks && (
                    <Button
                      mt={12}
                      variant="subtle"
                      size="compact-md"
                      rightSection={<Icon name="external" />}
                      component={ExternalLink}
                      href={url}
                    >
                      {t`Making dashboards faster`}
                    </Button>
                  )}
                </div>
              </HoverCard.Dropdown>
            </HoverCard>
          </Box>
        )}
      </Transition>
    </div>
  );
};
