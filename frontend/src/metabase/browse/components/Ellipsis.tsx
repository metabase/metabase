import type { FC } from "react";
import { forwardRef } from "react";

import type { RefProp } from "metabase/common/components/types";
import type { FlexProps } from "metabase/ui";
import { Text } from "metabase/ui";

import { EllipsisAndSeparator } from "./CollectionBreadcrumbsWithTooltip.styled";
import { PathSeparator } from "./PathSeparator";
type EllipsisProps = {
  includeSep?: boolean;
} & FlexProps;

export const Ellipsis: FC<EllipsisProps & Partial<RefProp<HTMLDivElement>>> =
  forwardRef<HTMLDivElement, EllipsisProps>(
    ({ includeSep = true, ...flexProps }, ref) => (
      <EllipsisAndSeparator
        ref={ref}
        align="center"
        className="ellipsis-and-separator"
        {...flexProps}
      >
        <Text lh={1}>…</Text>
        {includeSep && <PathSeparator />}
      </EllipsisAndSeparator>
    ),
  );
Ellipsis.displayName = "Ellipsis";
