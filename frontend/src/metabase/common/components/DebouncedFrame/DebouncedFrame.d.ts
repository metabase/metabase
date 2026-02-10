import type { CSSProperties, ReactNode } from "react";

export interface DebouncedFrameProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  enabled?: boolean;
  resetKey?: unknown;
}

declare const DebouncedFrame: React.ForwardRefExoticComponent<
  DebouncedFrameProps & React.RefAttributes<HTMLDivElement>
>;

// eslint-disable-next-line import/no-default-export
export default DebouncedFrame;
