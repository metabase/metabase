import { useState } from "react";
import useInterval from "react-use/lib/useInterval";

import { Progress } from "metabase/ui";
import { useRaf } from "react-use";
import { color } from "metabase/lib/colors";
import CS from "./UndoProgess.module.css"


export function UndoProgress({ paused, progress = 0, timeout }: { paused: boolean, progress: number }) {
  const elapsed = useRaf(timeout);

  const progressRemaining = 100 - progress * 100;
  const value = paused ? progressRemaining : progressRemaining * (1 - elapsed / 1000);


  return (
    <Progress
      className={CS.progress}
      key={value}
      size="sm"
      color={color(paused ? "bg-dark" : "brand")}
      value={Math.max(value, 0)}
      w="100%"
      left={0}
      top={0}
      style={{ position: "absolute", transition: "none" }}
    />
  );
}
