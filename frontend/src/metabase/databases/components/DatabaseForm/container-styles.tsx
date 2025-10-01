import { Box } from "metabase/ui";

import S from "./container-styles.module.css";

export function getContainer(containerStyle: string) {
  return containers[containerStyle] ?? Box;
}

const containers: Record<
  string,
  React.ComponentType<{ children: React.ReactNode }>
> = {
  "host-and-port-section": HostAndPortContainer,
};

export function HostAndPortContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={S.hostAndPortContainer}>{children}</div>;
}
