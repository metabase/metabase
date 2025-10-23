import type { PropsWithChildren } from "react";
import { ResizableBox } from "react-resizable";
import { useLocalStorage } from "react-use";

import { ResizableBoxHandle } from "./BenchApp";

const LOCAL_STORAGE_KEY = "metabase-bench-side-nav-width";
const DEFAULT_WIDTH = 320;

export const BenchSideNav = ({ children }: PropsWithChildren) => {
  const [width, setWidth] = useLocalStorage(LOCAL_STORAGE_KEY, DEFAULT_WIDTH);

  return (
    <ResizableBox
      resizeHandles={["e"]}
      axis="x"
      minConstraints={[120, Infinity]}
      maxConstraints={[800, Infinity]}
      width={width ?? DEFAULT_WIDTH}
      handle={<ResizableBoxHandle />}
      onResizeStop={(_, { size }) => setWidth(size.width)}
    >
      {children}
    </ResizableBox>
  );
};
