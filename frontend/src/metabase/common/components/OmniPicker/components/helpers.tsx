import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { Box, Loader as MantineLoader } from "metabase/ui";

import Styles from "./OmniPicker.module.css";

export const Loader = () => {
  return <MantineLoader />;
}

export function ItemListWrapper({ children }: { children: React.ReactNode[] }) {
  return (
    <Box className={Styles.ListContainer}>
      <VirtualizedList>
        {children}
      </VirtualizedList>
    </Box>
  );
}
