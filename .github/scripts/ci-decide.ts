/**
 * Layer 0 of the CI decision ladder: global overrides.
 *
 * Pure — every fact arrives in `Context`. One verdict for the whole run, not a
 * per-suite map. `defer` means layer 0 has no opinion and the existing
 * per-suite machinery decides.
 */

export type Verdict = "force-run" | "force-skip" | "defer";

export type Context = {
  ref: string;
  tags: string[];
};

export type Decision = {
  verdict: Verdict;
  reason: string;
};

const isProtected = (ref: string) =>
  ref === "master" || ref.startsWith("release-x.");

/** Order is precedence: a protected ref outranks every tag, and run-all outranks skip. */
export const decide = ({ ref, tags }: Context): Decision => {
  if (isProtected(ref)) {
    return { verdict: "force-run", reason: `${ref} is a protected branch` };
  }
  if (tags.includes("ci:run-all")) {
    return { verdict: "force-run", reason: "ci:run-all requested" };
  }
  if (tags.includes("ci:skip")) {
    return { verdict: "force-skip", reason: "ci:skip requested" };
  }
  return { verdict: "defer", reason: "no global override" };
};
