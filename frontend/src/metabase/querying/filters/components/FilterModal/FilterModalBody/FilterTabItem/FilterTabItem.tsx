import { Box, type BoxProps } from "metabase/ui";

import S from "./FilterTabItem.module.css";

interface FilterTabItemProps extends BoxProps {
  component?: any;
}

export const FilterTabItem = ({ className, ...props }: FilterTabItemProps) => {
  return <Box className={`${S.FilterTabItem} ${className}`} {...props} />;
};
