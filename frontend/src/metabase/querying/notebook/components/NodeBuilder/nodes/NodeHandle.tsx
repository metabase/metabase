import {
  Handle,
  type HandleType,
  type Position,
  useNodeConnections,
} from "@xyflow/react";
import cx from "classnames";
import type { CSSProperties } from "react";

import { nodeColorById } from "../graph";

import S from "./nodes.module.css";

type NodeHandleProps = {
  type: HandleType;
  position: Position;
  id: string;
  isConnectable?: boolean;
  style?: CSSProperties;
};

// A React Flow handle that fills in once something is wired to it. An input
// also takes the colour of the block feeding it, so wire and socket match.
export function NodeHandle({
  type,
  position,
  id,
  isConnectable,
  style,
}: NodeHandleProps) {
  const connections = useNodeConnections({ handleType: type, handleId: id });
  const isConnected = connections.length > 0;
  const incomingColor =
    type === "target" && isConnected
      ? nodeColorById(connections[0].source)
      : null;
  // CSS custom properties are not part of React's CSSProperties type.
  const handleStyle = {
    ...style,
    ...(incomingColor ? { "--node-color": incomingColor } : {}),
  } as CSSProperties;

  return (
    <Handle
      type={type}
      position={position}
      id={id}
      isConnectable={isConnectable}
      style={handleStyle}
      className={cx(
        S.handle,
        isConnected ? S.handleConnected : S.handleDisconnected,
      )}
      data-connected={isConnected}
    />
  );
}
