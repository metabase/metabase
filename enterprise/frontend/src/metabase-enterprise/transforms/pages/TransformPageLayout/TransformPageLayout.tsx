import type { ReactNode } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";

import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { BenchLayout } from "metabase/bench/components/BenchLayout";
import { Box, type BoxProps } from "metabase/ui";

import { TransformList } from "../TransformListPage/TransformList";
import { TransformListPage } from "../TransformListPage/TransformListPage";

type TransformPageLayoutPropsParams = {
  transformId?: string;
  jobId?: string;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutPropsParams;
  fullWidth?: boolean;
  children?: ReactNode;
};

type TransformPageLayoutOwnProps = TransformPageLayoutProps & {
  maw?: string;
};

const ScrollBox = ({ children, ...rest }: { children: ReactNode } & BoxProps) => (
  <Box
    style={{
      overflow: "auto",
    }}
    {...rest}
  >
    {children}
  </Box>
);

export function TransformPageLayout({
  children,
  location,
}: TransformPageLayoutOwnProps) {
  return (
    <BenchLayout
      nav={<TransformList params={{ location }} />}
      name="transform"
    >
      {children}
    </BenchLayout>
  );
}

export function FullWidthTransformPageLayout(props: TransformPageLayoutProps) {
  return <TransformPageLayout {...props} fullWidth />;
}
