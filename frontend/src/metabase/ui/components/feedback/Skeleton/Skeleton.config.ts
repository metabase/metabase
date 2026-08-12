import type { SkeletonFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./Skeleton.module.css";

export const skeletonOverrides = {
  Skeleton: themeComponent<SkeletonFactory>({
    classNames: {
      root: S.Skeleton,
    },
  }),
};
