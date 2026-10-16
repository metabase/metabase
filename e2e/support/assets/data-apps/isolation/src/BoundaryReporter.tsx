import { Component } from "react";
import type { ReactNode } from "react";

import { describeError } from "./utils";

// Catches a gated-tag throw from the guest reconciler so it reports `isolated:`
// rather than tearing the tree down. (`.message` may itself throw across the
// membrane — read it defensively.)
export class BoundaryReporter extends Component<
  { onResult: (msg: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    let reason = "opaque";
    try {
      reason = describeError(error);
    } catch {
      // keep "opaque"
    }
    this.props.onResult(`isolated:${reason}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
