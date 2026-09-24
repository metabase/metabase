import { useNodeBuilderContext } from "../context";

import S from "./Shine.module.css";

// Light sweep over the card it sits in; mounts only while the canvas says so.
export function Shine() {
  const { isShining } = useNodeBuilderContext();
  if (!isShining) {
    return null;
  }
  return <div className={S.shine} aria-hidden="true" />;
}
