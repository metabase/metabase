import { type JSX, useLayoutEffect, useRef, useState } from "react";

import { Box, Flex, Skeleton, Stack } from "metabase/ui";
import resizeObserver from "metabase/utils/resize-observer";
import { getScalarSizeTier } from "metabase/visualizations/components/ScalarValue/sizing";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption";

import S from "./ScalarSkeleton.module.css";

// the title renders at fz "md" / lh "md", which is a 17px line
const TITLE_LINE_HEIGHT = 17;
const PILL_RADIUS = 8;
const TITLE_PILL_HEIGHT = 8;

// measures synchronously on mount so the first paint already has the right
// tier, then follows resizes
const useMeasuredSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };

    update();
    resizeObserver.subscribe(element, update);

    return () => {
      resizeObserver.unsubscribe(element, update);
    };
  }, []);

  return { ref, ...size };
};

const ScalarSkeleton = ({
  name,
  description,
  actionMenu,
  className,
}: {
  name?: string | null;
  description?: string | null;
  actionMenu?: JSX.Element | null;
  className?: string;
}): JSX.Element => {
  const { ref, width, height } = useMeasuredSize();
  const tier = getScalarSizeTier(width, height);

  return (
    <Flex
      ref={ref}
      className={className}
      pos="relative"
      direction="column"
      justify="center"
      align="center"
      w="100%"
      h="100%"
      data-testid="scalar-skeleton"
    >
      {actionMenu && <Box className={S.actionMenu}>{actionMenu}</Box>}
      <Stack align="center" gap={tier.valueTitleGap}>
        <Flex align="center" justify="center" h={tier.valueFontSize}>
          <Skeleton
            radius={PILL_RADIUS}
            w={tier.skeleton.valueWidth}
            h={tier.skeleton.valueHeight}
          />
        </Flex>
        {name ? (
          <SkeletonCaption name={name} description={description} size="large" />
        ) : (
          tier.showsTitle && (
            <Flex align="center" justify="center" h={TITLE_LINE_HEIGHT}>
              <Skeleton
                radius={PILL_RADIUS}
                w={tier.skeleton.titleWidth}
                h={TITLE_PILL_HEIGHT}
              />
            </Flex>
          )
        )}
      </Stack>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScalarSkeleton;
