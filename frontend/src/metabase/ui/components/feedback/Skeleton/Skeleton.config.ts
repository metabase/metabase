import { Skeleton } from "@mantine/core";

import S from "./Skeleton.module.css";

export const skeletonOverrides = {
  Skeleton: Skeleton.extend({
    classNames: {
      root: S.Skeleton,
    },
  }),
};
