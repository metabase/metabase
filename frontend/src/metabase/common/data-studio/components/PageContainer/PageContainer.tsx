import React, { useEffect } from "react";
import { useUnmount } from "react-use";

import { useDispatch } from "metabase/redux";
import { setPageFrame } from "metabase/redux/app";
import { Stack, type StackProps } from "metabase/ui";

const PAGE_GUTTER = "3.5rem";

export const PageContainer = React.forwardRef(function PageContainerInner(
  { children, ...rest }: React.PropsWithChildren<StackProps>,
  ref: React.Ref<HTMLDivElement>,
) {
  const dispatch = useDispatch();

  // The app header sits above this container, so it has to be told which
  // background and gutter to use or it cuts a lighter strip across the top of
  // the page and its breadcrumbs sit off the page's left edge.
  useEffect(() => {
    dispatch(setPageFrame({ background: "secondary", gutter: PAGE_GUTTER }));
  }, [dispatch]);

  useUnmount(() => {
    dispatch(setPageFrame(null));
  });

  return (
    <Stack
      bg="background_page-secondary"
      h="100%"
      pb="2rem"
      px={PAGE_GUTTER}
      gap="xxl"
      style={{ overflow: "auto" }}
      ref={ref}
      {...rest}
    >
      {children}
    </Stack>
  );
});
