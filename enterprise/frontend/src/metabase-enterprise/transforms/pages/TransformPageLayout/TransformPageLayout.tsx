import type { ReactNode } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";

import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { Box, type BoxProps } from "metabase/ui";

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
    <PanelGroup autoSaveId="transform-layout" direction="horizontal">
      <Panel>
        <ScrollBox w="30rem" p="md" h="100%">
          <TransformListPage location={location}/>
        </ScrollBox>
      </Panel>
      <ResizeHandle />
      <Panel>
        <ScrollBox p="md" key="details" h="100%">
          {children}
        </ScrollBox>
      </Panel>
    </PanelGroup>
  );
}

export function FullWidthTransformPageLayout(props: TransformPageLayoutProps) {
  return <TransformPageLayout {...props} fullWidth />;
}
