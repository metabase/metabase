import React, { useEffect } from "react";
import { useUnmount } from "react-use";

import { useDispatch } from "metabase/redux";
import { setPageBackground } from "metabase/redux/app";
import { Stack, type StackProps } from "metabase/ui";

export const PageContainer = React.forwardRef(function PageContainerInner(
  { children, ...rest }: React.PropsWithChildren<StackProps>,
  ref: React.Ref<HTMLDivElement>,
) {
  const dispatch = useDispatch();

  // The app header sits above this container, so it has to be told which
  // background to paint or it cuts a lighter strip across the top of the page.
  useEffect(() => {
    dispatch(setPageBackground("secondary"));
  }, [dispatch]);

  useUnmount(() => {
    dispatch(setPageBackground("primary"));
  });

  return (
    <Stack
      bg="background_page-secondary"
      h="100%"
      pb="2rem"
      px="3.5rem"
      gap="xxl"
      style={{ overflow: "auto" }}
      ref={ref}
      {...rest}
    >
      {children}
    </Stack>
  );
});
