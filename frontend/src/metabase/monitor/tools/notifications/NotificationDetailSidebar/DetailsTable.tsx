import type { ReactNode } from "react";
import { Children, Fragment } from "react";

import { Box, Divider } from "metabase/ui";

import S from "./NotificationDetailSidebar.module.css";

export const DetailsTable = ({ children }: { children: ReactNode }) => {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Box
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="lg"
      className={S.detailsTable}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider />}
          {item}
        </Fragment>
      ))}
    </Box>
  );
};
