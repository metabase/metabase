import { ResizeObserver as JuggleResizeObserver } from "@juggle/resize-observer";

if (window) {
  window.ResizeObserver = JuggleResizeObserver;
}
